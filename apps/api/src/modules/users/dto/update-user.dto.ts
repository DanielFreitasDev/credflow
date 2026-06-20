import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

// All fields optional; password handled separately for clarity but allowed here.
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, [] as const)) {}
