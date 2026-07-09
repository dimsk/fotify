import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class MdnsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MdnsService.name);
  private bonjour: any = null;
  private service: any = null;

  async onModuleInit() {
    const port = parseInt(process.env.FRONTEND_PORT ?? '15766', 10);
    const hostname = os.hostname();

    try {
      // Dynamic import so missing package doesn't crash startup
      const { Bonjour } = await import('bonjour-service');
      this.bonjour = new Bonjour();
      this.service = this.bonjour.publish({
        name: `Fotify@${hostname}`,
        type: 'fotify',
        port,
        txt: { version: '1', host: hostname },
      });
      this.logger.log(
        `mDNS: advertising "Fotify@${hostname}" (_fotify._tcp) on port ${port}`,
      );
    } catch (err: any) {
      // bonjour-service not installed or multicast unavailable → silent degradation
      this.logger.warn(`mDNS advertisement not available: ${err.message}`);
    }
  }

  onModuleDestroy() {
    try {
      this.service?.stop?.();
      this.bonjour?.destroy?.();
    } catch {
      // ignore
    }
  }
}
