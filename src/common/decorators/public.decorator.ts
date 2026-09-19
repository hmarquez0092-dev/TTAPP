import { SetMetadata } from '@nestjs/common';

// Marca una ruta como accesible sin JWT (ej. /auth/login, /health).
// Sin esto, JwtAuthGuard bloquea TODO por defecto — "seguro por diseño",
// no "abierto salvo que se proteja".
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
