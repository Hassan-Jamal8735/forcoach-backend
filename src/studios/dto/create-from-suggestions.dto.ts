import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SuggestedStudioDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Text to match imported classes on. Defaults to the name when omitted. */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsIn(['hourly', 'per_class'])
  compensationType!: 'hourly' | 'per_class';

  @IsNumber()
  @Min(0)
  compensationValue!: number;
}

export class CreateFromSuggestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SuggestedStudioDto)
  studios!: SuggestedStudioDto[];
}
