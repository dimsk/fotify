import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SlideshowStateService } from './slideshow-state.service';
import { ScanService } from '../scan/scan.service';

/**
 * Pushes the shared slideshow state to every connected display the moment
 * it changes, replacing the client's poll loop. All timeline decisions stay
 * server-side in SlideshowStateService — this gateway is a thin transport:
 * displays register with their clientId (same presence bookkeeping as the
 * HTTP heartbeat), receive the current state on connect, and every
 * subsequent change is broadcast.
 */
@WebSocketGateway({ cors: true })
export class SlideshowGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SlideshowGateway.name);

  @WebSocketServer()
  private server: Server;

  /** socketId → clientId, so disconnects can drop the right presence entry. */
  private readonly clientIds = new Map<string, string>();

  constructor(
    private readonly slideshowStateService: SlideshowStateService,
    private readonly scanService: ScanService,
  ) {
    this.slideshowStateService.addStateListener((state) => {
      this.server?.emit('slideshow:state', state);
    });
    this.scanService.addProgressListener((sourceId, event) => {
      // Tag with sourceId so clients sharing one socket can tell which
      // source each event belongs to (the room isolates delivery, but a
      // socket joined to multiple rooms receives all their events).
      this.server
        ?.to(`scan:${sourceId}`)
        .emit('scan:progress', { ...event, sourceId });
    });
  }

  handleConnection(socket: Socket): void {
    // Send the current state immediately so a freshly-connected display can
    // render without waiting for the next advance.
    socket.emit('slideshow:state', this.slideshowStateService.getCurrentState());
  }

  handleDisconnect(socket: Socket): void {
    const clientId = this.clientIds.get(socket.id);
    if (clientId) {
      this.clientIds.delete(socket.id);
      this.slideshowStateService.removeClient(clientId);
    }
  }

  /** Registers/renews a display's presence — the WS equivalent of the HTTP heartbeat. */
  @SubscribeMessage('slideshow:heartbeat')
  async handleHeartbeat(socket: Socket, clientId: string): Promise<void> {
    if (typeof clientId !== 'string' || clientId.length === 0) return;
    this.clientIds.set(socket.id, clientId);
    await this.slideshowStateService.recordClientHeartbeat(clientId);
  }

  /** A display reports the current video slide is playing and ready to be timed. */
  @SubscribeMessage('slideshow:ready')
  async handleReady(
    socket: Socket,
    payload: { clientId: string; slideId: string },
  ): Promise<void> {
    if (typeof payload?.clientId !== 'string' || typeof payload?.slideId !== 'string')
      return;
    this.clientIds.set(socket.id, payload.clientId);
    await this.slideshowStateService.recordSlideReady(
      payload.clientId,
      payload.slideId,
    );
  }

  /** A display failed to render the current video slide — advance past it. */
  @SubscribeMessage('slideshow:failed')
  async handleFailed(
    socket: Socket,
    payload: { clientId: string; slideId: string },
  ): Promise<void> {
    if (typeof payload?.clientId !== 'string' || typeof payload?.slideId !== 'string')
      return;
    this.clientIds.set(socket.id, payload.clientId);
    await this.slideshowStateService.recordSlideFailed(
      payload.clientId,
      payload.slideId,
    );
  }

  /** Admin UI subscribes to one source's scan progress (replaces the SSE stream). */
  @SubscribeMessage('scan:watch')
  async handleScanWatch(socket: Socket, sourceId: number): Promise<void> {
    const id = Number(sourceId);
    if (!Number.isInteger(id) || id <= 0) return;
    await socket.join(`scan:${id}`);
    // Emit the current status immediately so late subscribers don't wait for
    // the next progress tick (mirrors the old SSE behavior for idle sources).
    const latest = await this.scanService.currentProgress(id);
    socket.emit('scan:progress', { ...latest, sourceId: id });
  }

  @SubscribeMessage('scan:unwatch')
  async handleScanUnwatch(socket: Socket, sourceId: number): Promise<void> {
    const id = Number(sourceId);
    if (!Number.isInteger(id) || id <= 0) return;
    await socket.leave(`scan:${id}`);
  }
}
