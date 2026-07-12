import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

/**
 * REALTIME MODULE  (Stage 5)
 * --------------------------
 * Registers the WebSocket gateway. EventEmitterModule.forRoot() is registered once
 * globally in AppModule, so the gateway can @OnEvent without importing anything here.
 */
@Module({
  providers: [EventsGateway],
})
export class RealtimeModule {}
