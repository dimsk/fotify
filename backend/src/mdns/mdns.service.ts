import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as os from 'os';
import * as dgram from 'dgram';

@Injectable()
export class MdnsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MdnsService.name);
  private readonly discoveryPort = parseInt(process.env.FOTIFY_DISCOVERY_PORT ?? '15767', 10);
  private readonly multicastAddress = '239.255.157.66';
  private bonjour: any = null;
  private service: any = null;
  private udpSocket: dgram.Socket | null = null;
  private udpInterval: NodeJS.Timeout | null = null;

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

    this.startUdpBeacon(hostname, port);
  }

  onModuleDestroy() {
    if (this.udpInterval) clearInterval(this.udpInterval);
    try {
      this.service?.stop?.();
      this.bonjour?.destroy?.();
      this.udpSocket?.close?.();
    } catch {
      // ignore
    }
  }

  private startUdpBeacon(hostname: string, frontendPort: number) {
    const payload = this.discoveryPayload(hostname, frontendPort);

    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udpSocket.on('error', (err) => {
        this.logger.warn(`UDP discovery beacon error: ${err.message}`);
      });
      this.udpSocket.on('message', (message, rinfo) => {
        this.handleDiscoveryMessage(message, rinfo, payload);
      });
      this.udpSocket.bind(this.discoveryPort, '0.0.0.0', () => {
        this.udpSocket?.setBroadcast(true);
        this.udpSocket?.setMulticastTTL(1);

        const sendBeacon = () => {
          for (const host of this.getUdpTargets()) {
            this.udpSocket?.send(payload, this.discoveryPort, host);
          }
        };

        sendBeacon();
        this.udpInterval = setInterval(sendBeacon, 3000);
        this.logger.log(
          `UDP discovery: listening and broadcasting Fotify on port ${frontendPort} via UDP ${this.discoveryPort}`,
        );
      });
    } catch (err: any) {
      this.logger.warn(`UDP discovery beacon not available: ${err.message}`);
    }
  }

  private discoveryPayload(hostname: string, frontendPort: number) {
    return Buffer.from(
      JSON.stringify({
        type: 'fotify-discovery',
        version: 1,
        name: `Fotify@${hostname}`,
        frontendPort,
        path: '/',
      }),
    );
  }

  private handleDiscoveryMessage(
    message: Buffer,
    rinfo: dgram.RemoteInfo,
    payload: Buffer,
  ) {
    const text = message.toString('utf8').trim();
    if (text !== 'fotify-discovery-query') return;

    this.udpSocket?.send(payload, rinfo.port, rinfo.address, (err) => {
      if (err) {
        this.logger.warn(
          `UDP discovery: failed replying to ${rinfo.address}:${rinfo.port}: ${err.message}`,
        );
      } else {
        this.logger.debug(`UDP discovery: replied to ${rinfo.address}:${rinfo.port}`);
      }
    });
  }

  private getUdpTargets() {
    const targets = new Set<string>(['255.255.255.255', this.multicastAddress]);

    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family !== 'IPv4' || entry.internal || !entry.netmask) continue;
        const broadcast = this.broadcastAddress(entry.address, entry.netmask);
        if (broadcast) targets.add(broadcast);
      }
    }

    return Array.from(targets);
  }

  private broadcastAddress(address: string, netmask: string) {
    const ip = this.ipv4ToInt(address);
    const mask = this.ipv4ToInt(netmask);
    if (ip == null || mask == null) return null;
    return this.intToIpv4((ip & mask) | (~mask >>> 0));
  }

  private ipv4ToInt(value: string) {
    const parts = value.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }
    return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
  }

  private intToIpv4(value: number) {
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
  }
}
