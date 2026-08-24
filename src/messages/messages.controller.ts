import { Controller, Post, Get, Body } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { EventsGateway } from '../events/events.gateway';
import { Message } from './message.entity';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post()
  async create(
    @Body('sender') sender: string,
    @Body('text') text: string,
  ): Promise<Message> {
    // 1. Save to Database
    const message = await this.messagesService.create(sender, text);

    // 2. Broadcast to all WebSocket clients in real-time
    this.eventsGateway.server.emit('message', {
      id: message.id,
      sender: message.sender,
      text: message.text,
      createdAt: message.createdAt,
    });

    return message;
  }

  @Get()
  async findAll(): Promise<Message[]> {
    return this.messagesService.findAll();
  }
}
