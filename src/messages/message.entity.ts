import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sender: string;

  @Column('text')
  text: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
