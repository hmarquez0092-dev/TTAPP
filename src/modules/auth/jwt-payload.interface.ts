// Lo que viaja dentro del JWT. Incluye permisos ya resueltos para no
// pegarle a la base de datos en cada request — a costa de que un cambio
// de permisos no aplica hasta que el token expire (mitigado con un
// tiempo de vida corto, ver JWT_EXPIRES_IN).
export interface JwtPayload {
  sub: string; // userId
  organizationId: string;
  role: string; // code del rol, ej. 'DRIVER', 'OPERATOR', 'ADMIN'
  permissions: string[];
}

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  role: string;
  permissions: string[];
}
