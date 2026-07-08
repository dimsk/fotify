import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateGoogleOAuthConfigDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  // Not validated with @IsUrl — this is a free-form origin the admin knows
  // best (may be a bare LAN IP, "localhost", or a domain with a non-standard
  // port), and library URL validators tend to reject perfectly valid values
  // like that.
  @IsString()
  @IsNotEmpty()
  publicUrl: string;

  /** Optional so the admin can update just the Client ID/public URL without re-entering an already-saved secret. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clientSecret?: string;
}
