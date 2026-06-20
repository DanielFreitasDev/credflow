import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { AuthUser } from '../../../common/decorators/current-user.decorator';

/**
 * Role-based authorization. Routes without @Roles() are open to any
 * authenticated user. ADMIN is allowed everywhere.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser;
    if (!user) throw new ForbiddenException('Missing authenticated user');
    if (user.role === Role.ADMIN) return true;

    if (!required.includes(user.role as Role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
