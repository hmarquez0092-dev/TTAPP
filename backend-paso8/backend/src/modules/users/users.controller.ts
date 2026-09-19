import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';

@Controller('users')
export class UsersController {
  // Cualquier usuario autenticado puede ver su propia identidad — sin
  // @RequirePermissions, el unico requisito es un JWT valido.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // Ejemplo de ruta que SI exige un permiso especifico — prueba real de
  // PermissionsGuard, no solo de autenticacion.
  @RequirePermissions('users.manage')
  @Get()
  listAll() {
    return { message: 'Si ves esto, tu rol tiene el permiso users.manage' };
  }
}
