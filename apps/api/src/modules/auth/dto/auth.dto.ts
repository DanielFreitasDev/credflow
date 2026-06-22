import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Argon2/bcrypt only consider the first 72 bytes; capping the input also blocks a
// CPU/memory-amplification DoS (each verify allocates 64 MiB) from a giant password.
const PASSWORD_MAX = 72;

export class LoginDto {
  @ApiProperty({ example: 'admin@credflow.dev' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(PASSWORD_MAX)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, description: 'At least 12 chars, with letters and numbers' })
  @IsString()
  @MinLength(12)
  @MaxLength(PASSWORD_MAX)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'newPassword must contain both letters and numbers',
  })
  newPassword!: string;
}
