import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * CSRF `state` tracking for the Google OAuth flow. The app has no
 * session/auth layer to bind a state token to, so a short-lived, single-use
 * in-memory map is used instead — sufficient for a single-admin kiosk app,
 * not a general-purpose solution.
 */
@Injectable()
export class GoogleOAuthStateService {
  private readonly pending = new Map<string, number>();

  create(): string {
    this.sweep();
    const state = randomBytes(16).toString('hex');
    this.pending.set(state, Date.now() + STATE_TTL_MS);
    return state;
  }

  /** Single-use: consumes and validates a state token from the OAuth callback. */
  consume(state: string): boolean {
    const expiresAt = this.pending.get(state);
    this.pending.delete(state);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.pending) {
      if (expiresAt <= now) this.pending.delete(key);
    }
  }
}
