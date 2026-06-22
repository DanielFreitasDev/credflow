import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ContactType,
  CustomerStatus,
  CustomerType,
  DocumentType,
} from '../../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AddressDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) street!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) complement?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) district?: string;
  @ApiProperty() @IsString() @MaxLength(120) city!: string;
  @ApiProperty({ example: 'SP' }) @IsString() @MaxLength(2) state!: string;
  @ApiProperty({ example: '01001-000' }) @IsString() @MaxLength(12) zipCode!: string;
  @ApiPropertyOptional({ default: 'BR' }) @IsOptional() @IsString() @MaxLength(60) country?: string;
}

export class ContactDto {
  @ApiProperty({ enum: ContactType }) @IsEnum(ContactType) type!: ContactType;
  @ApiProperty() @IsString() @MaxLength(150) value!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) label?: string;
  @ApiPropertyOptional() @IsOptional() isPrimary?: boolean;
}

export class CustomerDocumentDto {
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) type!: DocumentType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) issuer?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateCustomerDto {
  @ApiProperty({ enum: CustomerType })
  @IsEnum(CustomerType)
  type!: CustomerType;

  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'PJ trade name (nome fantasia)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @ApiProperty({ description: 'CPF (PF) or CNPJ (PJ); digits or formatted', example: '390.533.447-05' })
  @IsString()
  @MaxLength(20)
  document!: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ description: 'PF birth date (ISO)' }) @IsOptional() @IsISO8601() birthDate?: string;
  @ApiPropertyOptional({ description: 'PJ foundation date (ISO)' }) @IsOptional() @IsISO8601() foundationDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) occupation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) employerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) employmentType?: string;

  @ApiPropertyOptional({ description: 'Monthly income (PF) or revenue (PJ)', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyIncome?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, default: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  internalScore?: number;

  // NOTE: `status` is intentionally NOT settable here. The customer state machine
  // is enforced only through `PATCH /customers/:id/status` (role-restricted +
  // transition-validated + audited). Accepting it on create/update would let an
  // operator skip states (e.g. create an ACTIVE customer or flip BLOCKED->ACTIVE),
  // bypassing the guarded route. New customers always start as PROSPECT.

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({ type: [ContactDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];

  @ApiPropertyOptional({ type: [CustomerDocumentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CustomerDocumentDto)
  documents?: CustomerDocumentDto[];
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CustomerType }) @IsOptional() @IsEnum(CustomerType) type?: CustomerType;
  @ApiPropertyOptional({ enum: CustomerStatus }) @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
}

export class UpdateStatusDto {
  @ApiProperty({ enum: CustomerStatus }) @IsEnum(CustomerStatus) status!: CustomerStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class UpdateScoreDto {
  @ApiProperty({ minimum: 0, maximum: 1000 }) @IsInt() @Min(0) @Max(1000) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
