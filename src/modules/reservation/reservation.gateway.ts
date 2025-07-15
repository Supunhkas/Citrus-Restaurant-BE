import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/reservations' })
export class ReservationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    console.log('Gateway initialized', server);
    // Gateway initialized
  }

  handleConnection(client: any) {
    console.log('Client connected', client);
    // Client connected
  }

  handleDisconnect(client: any) {
    console.log('Client disconnected', client);
    // Client disconnected
  }

  // Emit new reservation event to admins
  emitNewReservation(reservation: any) {
    this.server.emit('reservation:new', reservation);
  }

  // Emit reservation approval event to admins and user
  emitReservationApproved(reservation: any) {
    this.server.emit('reservation:approved', reservation);
  }

  // Emit reservation rejection event to admins and user
  emitReservationRejected(reservation: any) {
    this.server.emit('reservation:rejected', reservation);
  }
}
