import { IsString, Length } from 'class-validator';

export class SlideshowPresenceDto {
  @IsString()
  @Length(8, 128)
  clientId: string;
}
