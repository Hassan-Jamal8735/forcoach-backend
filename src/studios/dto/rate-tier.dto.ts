import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class RateTierDto {
  @IsInt()
  @Min(0)
  minAttendance!: number;

  // Null/omitted means "and up" — an open-ended top bracket.
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttendance?: number;

  @IsNumber()
  @Min(0)
  rate!: number;
}
