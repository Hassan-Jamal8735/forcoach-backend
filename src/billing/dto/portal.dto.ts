import { IsOptional, IsString } from 'class-validator';

export class PortalDto {
  @IsOptional()
  @IsString()
  returnTo?: string;
}
