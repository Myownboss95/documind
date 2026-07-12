import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { DocumentStatus } from '../documents/document.entity';

/** The payload shape broadcast on every ingest status transition. */
export interface DocumentStatusEvent {
  documentId: string;
  status: DocumentStatus;
}

/** App-internal event name the ingest worker emits on EventEmitter2. */
export const DOCUMENT_STATUS_EVENT = 'document.status';

/**
 * EVENTS GATEWAY  (Stage 5 · live job status over WebSocket)
 * ----------------------------------------------------------
 * A Nest WebSocket **gateway** is the socket.io equivalent of a controller: instead
 * of HTTP routes it exposes real-time channels. Here it does one thing — push
 * document ingest status changes to every connected browser so the docs list can
 * update `pending → ingesting → ready/failed` WITHOUT polling or a refresh.
 *
 * DECOUPLING (why an event bus, not a direct call): the ingest worker (a BullMQ
 * consumer) must NOT know about sockets, and this gateway must NOT know about the
 * worker. So the worker emits an in-process app event via EventEmitter2; this
 * gateway subscribes with @OnEvent and re-broadcasts to socket clients. Swap either
 * side (e.g. move the gateway behind Redis pub/sub for multi-instance) without
 * touching the other. This is the same producer/consumer separation as the queue.
 *
 * WHY WebSocket here (vs the SSE used for LLM streaming): status pushes are small,
 * sporadic, server-initiated fan-outs to MANY clients — a persistent bidirectional
 * socket fits. SSE is one-way HTTP and better for a single long token stream.
 *
 * AUTH: this gateway is intentionally UNAUTHENTICATED for the demo — it only
 * broadcasts non-sensitive {documentId,status}. In production you'd authenticate the
 * handshake (verify a JWT in socket.handshake.auth.token in a guard/middleware) and
 * scope broadcasts to the owning user's room (server.to(`user:${id}`).emit(...)).
 *
 * CORS: the client runs on a different origin (Vite :5173 / Next :3000), so the
 * socket.io server must allow cross-origin handshakes — hence cors below.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('EventsGateway');

  // The underlying socket.io server, injected by Nest once the gateway is up.
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`ws connect ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`ws disconnect ${client.id}`);
  }

  /**
   * Bridge: an in-process 'document.status' app event -> a socket broadcast. The
   * ingest worker fires the app event; every connected client receives the payload
   * on the same 'document.status' channel.
   */
  @OnEvent(DOCUMENT_STATUS_EVENT)
  broadcastStatus(payload: DocumentStatusEvent): void {
    this.logger.log(`broadcast ${payload.documentId} -> ${payload.status}`);
    this.server?.emit(DOCUMENT_STATUS_EVENT, payload);
  }
}
