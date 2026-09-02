import { IsInt, Max, Min } from 'class-validator';

export class SetYearlyDiscountDto {
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff!: number;
}
