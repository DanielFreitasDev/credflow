import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@credflow.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, description: 'At least 12 chars, with letters and numbers' })
  @IsString()
  @MinLength(12)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'newPassword must contain both letters and numbers',
  })
  newPassword!: string;
}
