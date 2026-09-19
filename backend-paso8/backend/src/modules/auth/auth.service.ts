import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../../common/enums';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Se requiere email o telefono');
    }

    // organization/role/permissions en un solo query — es exactamente lo
    // que va a viajar dentro del JWT, sin vueltas extra a la base.
    const user = await this.users.findOne({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
      relations: ['role', 'role.permissions', 'organization'],
    });

    // Mismo mensaje generico si el usuario no existe o si la contrasena
    // esta mal: no darle a un atacante pistas de cual de las dos fallo.
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Cuenta suspendida o deshabilitada');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organization.id,
      role: user.role.code,
      permissions: user.role.permissions.map((p) => p.code),
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role.code,
      },
    };
  }

  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }
}
