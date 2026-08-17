import {
  IsInt,
  IsNumber,
  Min,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsIn(['google_calendar', 'csv', 'manual'])
  source?: 'google_calendar' | 'csv' | 'manual';

  @IsOptional()
  @ValidateIf((o: CreateEventDto) => o.studioId !== null)
  @IsUUID()
  studioId?: string | null;

  @IsOptional()
  @IsIn(['assigned', 'unassigned', 'excluded'])
  status?: 'assigned' | 'unassigned' | 'excluded';

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Overrides the studio's rate for this one class. null clears it.
  @IsOptional()
  @ValidateIf((o: CreateEventDto) => o.rateOverride !== null)
  @IsNumber()
  @Min(0)
  rateOverride?: number | null;

  // Manually entered head count, used to pick a rate bracket for
  // tiered-compensation studios. null clears it.
  @IsOptional()
  @ValidateIf((o: CreateEventDto) => o.attendanceCount !== null)
  @IsInt()
  @Min(0)
  attendanceCount?: number | null;
}
