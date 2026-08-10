import { IsString, Length } from 'class-validator';

export class SlideshowReadyDto {
  @IsString()
  @Length(8, 128)
  clientId: string;

  @IsString()
  @Length(1, 64)
  slideId: string;
}
