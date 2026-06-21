import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { buildPagination, paginatedResponse, resolveOrderBy } from '../../common/utils/pagination.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type SafeUser = Omit<User, 'passwordHash'>;

const SELECT_SAFE = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  static hashPassword(plain: string): Promise<string> {
    // Pinned Argon2id parameters (OWASP-aligned) so the cost can't silently
    // drift with a library default change. 64 MiB / 3 iterations / parallelism 4.
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await UsersService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        active: dto.active ?? true,
      },
      select: SELECT_SAFE,
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SELECT_SAFE,
        skip,
        take,
        orderBy: resolveOrderBy(query.sortBy, ['createdAt', 'name', 'email', 'role'], query.sortOrder),
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT_SAFE });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Internal use (auth): returns the full record including passwordHash. */
  findByEmailWithSecret(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findOne(id);
    await this.assertNotRemovingLastAdmin(id, { role: dto.role, active: dto.active });
    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      email: dto.email,
      role: dto.role,
      active: dto.active,
    };
    if (dto.password) {
      data.passwordHash = await UsersService.hashPassword(dto.password);
    }
    return this.prisma.user.update({ where: { id }, data, select: SELECT_SAFE });
  }

  async setActive(id: string, active: boolean): Promise<SafeUser> {
    await this.findOne(id);
    if (!active) await this.assertNotRemovingLastAdmin(id, { active: false });
    return this.prisma.user.update({ where: { id }, data: { active }, select: SELECT_SAFE });
  }

  /**
   * Prevents removing the last active administrator (by demotion or
   * deactivation), which would otherwise lock the platform out of user and role
   * management entirely.
   */
  private async assertNotRemovingLastAdmin(
    id: string,
    next: { role?: Role; active?: boolean },
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.role !== Role.ADMIN || !target.active) return;
    const losingAdmin =
      (next.role !== undefined && next.role !== Role.ADMIN) || next.active === false;
    if (!losingAdmin) return;
    const activeAdmins = await this.prisma.user.count({
      where: { role: Role.ADMIN, active: true },
    });
    if (activeAdmins <= 1) {
      throw new BadRequestException('Cannot remove the last active administrator');
    }
  }

  touchLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }
}
