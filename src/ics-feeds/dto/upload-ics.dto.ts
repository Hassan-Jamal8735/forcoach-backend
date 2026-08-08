import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadIcsDto {
  // Raw .ics file contents, read client-side and posted as text.
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsUUID()
  defaultStudioId?: string;
}
