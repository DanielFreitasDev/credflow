import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Maria Analista' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'maria@credflow.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ngP@ssword1', minLength: 12 })
  @IsString()
  @MinLength(12) // aligned with the self-service change-password policy
  @MaxLength(72) // argon2/bcrypt safe bound
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain upper, lower case letters and a number',
  })
  password!: string;

  @ApiProperty({ enum: Role, default: Role.OPERATOR })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
