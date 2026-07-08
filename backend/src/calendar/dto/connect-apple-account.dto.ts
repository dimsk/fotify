import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ConnectAppleAccountDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsEmail()
  appleId: string;

  @IsString()
  @IsNotEmpty()
  appPassword: string;
}
