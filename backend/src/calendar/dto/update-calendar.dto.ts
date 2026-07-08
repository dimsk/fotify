import { IsBoolean, IsHexColor, IsOptional } from 'class-validator';

export class UpdateCalendarDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
