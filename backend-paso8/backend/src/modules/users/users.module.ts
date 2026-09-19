import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { Branch } from './entities/branch.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Branch, Role, Permission, User])],
  controllers: [UsersController],
  exports: [TypeOrmModule],
})
export class UsersModule {}
