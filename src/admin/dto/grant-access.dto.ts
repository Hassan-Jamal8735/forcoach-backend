import { IsInt, Max, Min } from 'class-validator';

export class GrantAccessDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  days!: number;
}
