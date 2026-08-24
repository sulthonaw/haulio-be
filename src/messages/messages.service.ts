import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async create(sender: string, text: string): Promise<Message> {
    const newMessage = this.messageRepository.create({
      sender,
      text,
    });
    return this.messageRepository.save(newMessage);
  }

  async findAll(): Promise<Message[]> {
    return this.messageRepository.find({
      order: { createdAt: 'DESC' },
      take: 50, // Limit to last 50 messages
    });
  }
}
