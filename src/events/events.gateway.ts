import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Custom event listener for "message" event
  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { sender: string; text: string; room?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Received message from ${client.id}: ${JSON.stringify(data)}`);

    // Save message to database
    const savedMessage = await this.messagesService.create(data.sender, data.text);
    
    const payload = {
      id: savedMessage.id,
      sender: savedMessage.sender,
      text: savedMessage.text,
      createdAt: savedMessage.createdAt,
      room: data.room,
    };

    if (data.room) {
      // Broadcast to specific room
      this.server.to(data.room).emit('message', payload);
    } else {
      // Broadcast to everyone
      this.server.emit('message', payload);
    }
  }

  // Event listener for joining rooms
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() roomName: string,
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`Client ${client.id} joined room: ${roomName}`);
    client.join(roomName);
    client.emit('joinedRoom', roomName);
  }

  // Event listener for leaving rooms
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() roomName: string,
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`Client ${client.id} left room: ${roomName}`);
    client.leave(roomName);
    client.emit('leftRoom', roomName);
  }
}
