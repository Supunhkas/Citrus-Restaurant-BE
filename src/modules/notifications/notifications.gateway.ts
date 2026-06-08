import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from 'src/common/interfaces/auth.interfaces';
import { ReservationDocument } from 'src/schema/reservation/reservation.schema';
import { PickupOrderDocument } from 'src/schema/order/pickup-order.schema';

@WebSocketGateway({
  cors: {
    origin: (
      origin: string,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow connections with no origin (e.g. server-side / health checks)
      // Actual origin validation happens per-connection in afterInit middleware
      cb(null, true);
    },
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  private allowedOrigin: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.allowedOrigin =
      this.configService.get<string>('app.url') || 'http://localhost:3000';
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');

    // Authenticate every socket connection before it is accepted
    server.use((socket: Socket, next) => {
      // Enforce origin
      const origin = socket.handshake.headers.origin;
      if (origin && origin !== this.allowedOrigin) {
        this.logger.warn(
          `WS connection rejected — disallowed origin: ${origin}`,
        );
        return next(new Error('Origin not allowed'));
      }

      // Verify JWT from handshake auth or query
      const token: string =
        socket.handshake.auth?.token ||
        (socket.handshake.query?.token as string);

      if (!token) {
        this.logger.warn(
          `WS connection rejected — no token provided (socket ${socket.id})`,
        );
        return next(new Error('Unauthorized'));
      }

      try {
        const payload = this.jwtService.verify(token) as JwtPayload;
        socket.data.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        };
        next();
      } catch {
        this.logger.warn(
          `WS connection rejected — invalid token (socket ${socket.id})`,
        );
        return next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const user = client.data?.user;
    if (user?.role === 'admin') {
      client.join('admin-room');
      this.logger.log(`Admin connected: ${user.email} (${client.id})`);
    } else {
      this.logger.log(
        `User connected: ${user?.email ?? 'unknown'} (${client.id})`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Reservation events (admin only) ──────────────────────────────────────

  notifyNewReservation(reservation: ReservationDocument) {
    this.server.to('admin-room').emit('reservationCreated', reservation);
  }

  notifyReservationConfirmed(reservation: ReservationDocument) {
    this.server.to('admin-room').emit('reservationConfirmed', reservation);
  }

  // ── Pickup order events (admin only) ─────────────────────────────────────

  notifyPickupOrder(order: PickupOrderDocument) {
    this.server.to('admin-room').emit('pickupOrderCreated', order);
  }
}
