import { ArrayMinSize, IsArray, IsUUID, ValidateIf } from 'class-validator';

export class BulkAssignEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];

  // null clears the studio (back to unassigned); a uuid assigns it.
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  studioId!: string | null;
}
