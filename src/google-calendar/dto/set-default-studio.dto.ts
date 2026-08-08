import { IsUUID, ValidateIf } from 'class-validator';

export class SetDefaultStudioDto {
  // null clears the default, so new imports arrive unassigned again.
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  studioId!: string | null;
}
