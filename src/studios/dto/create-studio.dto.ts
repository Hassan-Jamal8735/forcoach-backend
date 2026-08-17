import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RateTierDto } from './rate-tier.dto';

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

  @IsIn(['hourly', 'per_class', 'tiered'])
  compensationType!: 'hourly' | 'per_class' | 'tiered';

  // Not used when tiered — the rate comes from rateTiers instead.
  @ValidateIf((o: CreateStudioDto) => o.compensationType !== 'tiered')
  @IsNumber()
  @Min(0)
  compensationValue?: number;

  // Attendance brackets, only used when compensationType is 'tiered'. Sorted
  // by minAttendance isn't required here; the matching logic doesn't assume
  // order.
  @ValidateIf((o: CreateStudioDto) => o.compensationType === 'tiered')
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateTierDto)
  rateTiers?: RateTierDto[];

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
