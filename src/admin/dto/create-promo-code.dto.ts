import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreatePromoCodeDto {
  // Stripe promotion codes are case-sensitive and typically uppercase
  // alphanumeric; restricting input avoids awkward codes with spaces/symbols.
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Code can only contain letters, numbers, "-" and "_"',
  })
  code!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  percentOff!: number;

  @IsIn(['once', 'repeating', 'forever'])
  duration!: 'once' | 'repeating' | 'forever';

  @IsOptional()
  @IsInt()
  @Min(1)
  durationInMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;
}
