import { IsOptional, IsString, MinLength } from 'class-validator';

// Login por email O telefono — ambos son opcionales aqui, pero AuthService
// exige que venga al menos uno (ver auth.service.ts).
export class LoginDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;
}
