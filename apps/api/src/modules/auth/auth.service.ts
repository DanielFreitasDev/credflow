import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
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

  private async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmailWithSecret(email);
    // Always verify against a hash to mitigate user-enumeration timing attacks.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$invalidsaltinvalid$invalidhashinvalidhashinvalidhashinvalid';
    const ok = await argon2.verify(hash, password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    if (!user.active) throw new UnauthorizedException('User account is disabled');
    return user;
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
    });

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.getOrThrow('jwt.refreshSecret'),
        expiresIn: this.config.getOrThrow('jwt.refreshTtl'),
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
    let user: User;
    try {
      user = await this.validateUser(email, password);
    } catch (err) {
      // Record failed attempts for detection/monitoring (best-effort, never throws).
      await this.audit.record({
        action: 'LOGIN_FAILED',
        entity: 'User',
        after: { email },
        ip: meta.ip,
      });
      throw err;
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
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException('User is inactive');

    // Rotation: revoke the used token before issuing a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string): Promise<void> {
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
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await UsersService.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Invalidate all existing sessions on password change.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
