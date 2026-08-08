import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateStudioDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsIn(['hourly', 'per_class'])
  compensationType!: 'hourly' | 'per_class';

  @IsNumber()
  @Min(0)
  compensationValue!: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  // Extra words matched against imported class titles/locations to auto-assign
  // them to this studio. The studio name is always matched too.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  matchKeywords?: string[];
}
