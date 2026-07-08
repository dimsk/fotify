import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BrowseLocalDto {
  @IsOptional()
  @IsString()
  path?: string;
}

export class BrowseSmbDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsString()
  @IsNotEmpty()
  share: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  path?: string;
}
