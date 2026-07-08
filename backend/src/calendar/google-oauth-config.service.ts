import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleOAuthConfig } from './google-oauth-config.entity';
import { decryptSecret } from '../file-providers/smb-credentials.util';
import { encryptSecretOrThrow } from './encrypt-or-throw.util';

const CONFIG_ID = 1;
const CALLBACK_PATH = '/calendar/google/callback';

/**
 * The admin is shown the full redirect URI (origin + /calendar/google/callback)
 * to paste into Google Cloud Console, and it's an easy, natural mistake to
 * paste that same full value back into the "public URL" field here too —
 * which would otherwise get the callback path appended a second time by
 * getRedirectUri(), causing Google's redirect_uri_mismatch error. Stripping
 * a trailing copy of the callback path (and any trailing slash) makes both
 * forms of input resolve to the same, correct value.
 */
function normalizePublicUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  return trimmed.toLowerCase().endsWith(CALLBACK_PATH.toLowerCase())
    ? trimmed.slice(0, trimmed.length - CALLBACK_PATH.length)
    : trimmed;
}

export interface GoogleOAuthConfigStatus {
  configured: boolean;
  clientId: string | null;
  publicUrl: string | null;
}

@Injectable()
export class GoogleOAuthConfigService {
  constructor(
    @InjectRepository(GoogleOAuthConfig) private readonly repo: Repository<GoogleOAuthConfig>,
  ) {}

  async getStatus(): Promise<GoogleOAuthConfigStatus> {
    const config = await this.repo.findOneBy({ id: CONFIG_ID });
    return {
      configured: Boolean(config?.clientId && config?.clientSecretEnc && config?.publicUrl),
      clientId: config?.clientId ?? null,
      publicUrl: config?.publicUrl ?? null,
    };
  }

  /**
   * clientSecret is optional so the admin can update just the Client ID
   * or public URL without re-entering an already-saved secret — omitting
   * it keeps the existing encrypted secret untouched.
   */
  async save(clientId: string, publicUrl: string, clientSecret?: string): Promise<GoogleOAuthConfigStatus> {
    const config = (await this.repo.findOneBy({ id: CONFIG_ID })) ?? this.repo.create({ id: CONFIG_ID });
    if (!clientSecret && !config.clientSecretEnc) {
      throw new BadRequestException('Bitte ein Client-Secret angeben.');
    }
    config.clientId = clientId;
    config.publicUrl = normalizePublicUrl(publicUrl);
    if (clientSecret) config.clientSecretEnc = encryptSecretOrThrow(clientSecret);
    await this.repo.save(config);
    return this.getStatus();
  }

  /** Throws with a clear German message if the admin hasn't saved all three pieces yet. */
  async getCredentials(): Promise<{ clientId: string; clientSecret: string; publicUrl: string }> {
    const config = await this.repo.findOneBy({ id: CONFIG_ID });
    if (!config?.clientId || !config?.clientSecretEnc || !config?.publicUrl) {
      throw new BadRequestException(
        'Google-Zugangsdaten sind noch nicht vollständig hinterlegt. Bitte zuerst im Einrichtungsdialog speichern.',
      );
    }
    return {
      clientId: config.clientId,
      clientSecret: decryptSecret(config.clientSecretEnc),
      publicUrl: config.publicUrl,
    };
  }
}
