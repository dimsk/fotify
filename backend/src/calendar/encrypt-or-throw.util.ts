import { BadRequestException } from '@nestjs/common';
import { encryptSecret } from '../file-providers/smb-credentials.util';

export function encryptSecretOrThrow(plainText: string): string {
  try {
    return encryptSecret(plainText);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : 'Verschlüsselung fehlgeschlagen');
  }
}
