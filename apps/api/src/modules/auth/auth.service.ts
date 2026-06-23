import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../generated/prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { UsersService, SafeUser } from '../users/users.service';
import { JwtPayload } from './strategies/jwt.strategy';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Account-lockout policy: after MAX_FAILED consecutive failed logins the
  // account is locked for LOCK_MINUTES; a successful login resets the counter.
  private static readonly MAX_FAILED = 5;
  private static readonly LOCK_MINUTES = 15;
  // Verifying against a real-shaped dummy hash keeps login timing flat for
  // non-existent users (anti user-enumeration).
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$invalidsaltinvalid$invalidhashinvalidhashinvalidhashinvalid';

  /** Increments the failed-login counter and locks the account at the threshold. */
  private async registerFailedAttempt(user: User, meta: RequestMeta): Promise<void> {
    const next = user.failedLoginCount + 1;
    const lock = next >= AuthService.MAX_FAILED;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : next,
        lockedUntil: lock ? new Date(Date.now() + AuthService.LOCK_MINUTES * 60_000) : undefined,
      },
    });
    if (lock) {
      await this.audit.record({
        userId: user.id,
        action: 'ACCOUNT_LOCKED',
        entity: 'User',
        entityId: user.id,
        after: { lockedMinutes: AuthService.LOCK_MINUTES },
        ip: meta.ip,
      });
    }
  }

  private async issueTokens(user: User, meta: RequestMeta): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('jwt.accessSecret'),
      expiresIn: this.config.getOrThrow('jwt.accessTtl'),
      algorithm: 'HS256',
    });

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.getOrThrow('jwt.refreshSecret'),
        expiresIn: this.config.getOrThrow('jwt.refreshTtl'),
        algorithm: 'HS256',
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.users.findByEmailWithSecret(email);

    // Reject while locked. The dummy-hash verify below keeps timing flat for
    // non-existent users, so this adds no enumeration oracle beyond what a
    // lockout inherently implies.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.record({
        userId: user.id,
        action: 'LOGIN_BLOCKED',
        entity: 'User',
        entityId: user.id,
        ip: meta.ip,
      });
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed logins. Try again later.',
      );
    }

    const hash = user?.passwordHash ?? AuthService.DUMMY_HASH;
    const ok = await argon2.verify(hash, password).catch(() => false);

    if (!user || !ok) {
      if (user) await this.registerFailedAttempt(user, meta);
      await this.audit.record({ action: 'LOGIN_FAILED', entity: 'User', after: { email }, ip: meta.ip });
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.active) throw new UnauthorizedException('Conta de usuário desativada');

    // Successful login clears any failed-attempt / lock state.
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    const tokens = await this.issueTokens(user, meta);
    await this.users.touchLastLogin(user.id);
    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ip: meta.ip,
    });

    const { passwordHash, ...safe } = user;
    void passwordHash;
    return { ...tokens, user: safe };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow('jwt.refreshSecret'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token de atualização inválido ou expirado');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('O token de atualização não é mais válido');

    // Reuse detection: a token that was already rotated/revoked is being
    // presented again — treat it as theft and revoke the entire token family so
    // a stolen refresh token cannot outlive the legitimate session.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        userId: stored.userId,
        action: 'REFRESH_REUSE_DETECTED',
        entity: 'User',
        entityId: stored.userId,
        ip: meta.ip,
      });
      throw new UnauthorizedException('Reúso de token de atualização detectado; todas as sessões foram revogadas');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('O token de atualização não é mais válido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException('Usuário inativo');

    // Rotation: revoke the used token before issuing a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    // Revoke by the token's own (unique) hash, which the caller demonstrably
    // possesses. No userId is needed, so logout works even with an expired access
    // token; and because the hash identifies exactly one token, a user can only
    // ever revoke a token they hold — never someone else's.
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('A senha atual está incorreta');

    const passwordHash = await UsersService.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Invalidate all existing sessions on password change.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
