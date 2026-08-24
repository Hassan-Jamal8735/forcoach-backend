import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}
