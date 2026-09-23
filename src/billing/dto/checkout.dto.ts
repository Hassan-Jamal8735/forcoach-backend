import { IsIn, IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @IsIn(['monthly', 'yearly'])
  plan!: 'monthly' | 'yearly';

  // Mobile app deep link to land back on after checkout; validated against
  // an allow-list in the service.
  @IsOptional()
  @IsString()
  returnTo?: string;
}
