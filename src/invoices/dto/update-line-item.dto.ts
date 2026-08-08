import { IsNumber, Min } from 'class-validator';

export class UpdateLineItemDto {
  @IsNumber()
  @Min(0)
  rate!: number;
}
