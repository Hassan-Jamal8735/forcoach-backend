import { IsIn } from 'class-validator';

export class CheckoutDto {
  @IsIn(['monthly', 'yearly'])
  plan!: 'monthly' | 'yearly';
}
