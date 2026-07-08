import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Singleton row (same id=1 get-or-create pattern as Settings) holding the
 * Google OAuth client registration for this Fotify instance — admin-entered
 * via the "Google Kalender einrichten" guide, not an env var, so connecting
 * Google Calendar never requires editing files or restarting the server.
 */
@Entity()
export class GoogleOAuthConfig {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ type: 'text', nullable: true })
  clientId: string | null;

  @Column({ type: 'text', nullable: true })
  clientSecretEnc: string | null;

  /**
   * The public origin this app is reachable at from a browser (e.g.
   * http://192.168.1.50:15766) — used to build the OAuth redirect_uri sent
   * to Google and as the post-consent return address. Admin-entered here
   * rather than an env var, same reasoning as clientId/clientSecretEnc.
   */
  @Column({ type: 'text', nullable: true })
  publicUrl: string | null;
}
