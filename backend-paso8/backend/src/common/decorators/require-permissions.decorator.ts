import { SetMetadata } from '@nestjs/common';

// Uso: @RequirePermissions('trips.view', 'trips.manage')
// El usuario necesita al menos uno de los permisos listados (ver PermissionsGuard).
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
