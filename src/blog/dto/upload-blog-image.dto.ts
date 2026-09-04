import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class UploadBlogImageDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @Matches(/^image\/(png|jpeg|jpg|webp|gif)$/, {
    message: 'Only PNG, JPEG, WEBP, or GIF images are allowed.',
  })
  contentType!: string;

  @IsString()
  @IsNotEmpty()
  dataBase64!: string;
}
