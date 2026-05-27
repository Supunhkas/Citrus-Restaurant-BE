import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // In production, replace with your frontend URL
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('NotificationsGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Reservation events ────────────────────────────────────────────────────

  notifyNewReservation(reservation: any) {
    this.server.emit('reservationCreated', reservation);
  }

  notifyReservationConfirmed(reservation: any) {
    this.server.emit('reservationConfirmed', reservation);
  }

  // ── Pickup order events ───────────────────────────────────────────────────

  notifyPickupOrder(order: any) {
    this.server.emit('pickupOrderCreated', order);
  }
}
