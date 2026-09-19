import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../../modules/auth/jwt-payload.interface';

// Corre DESPUES de JwtAuthGuard (orden de registro en app.module.ts).
// Si el handler no tiene @RequirePermissions(...), no restringe nada mas
// alla de estar autenticado — el permiso es opt-in, explicito por ruta.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) return false; // JwtAuthGuard deberia haber corrido antes

    const hasPermission = required.some((perm) => user.permissions.includes(perm));
    if (!hasPermission) {
      throw new ForbiddenException(
        `Requiere alguno de estos permisos: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
