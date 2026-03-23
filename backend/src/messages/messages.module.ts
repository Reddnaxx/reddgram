import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatsModule } from '../chats/chats.module.js';
import { MessagesGateway } from './messages.gateway.js';

@Module({
  imports: [AuthModule, ChatsModule],
  providers: [MessagesGateway],
})
export class MessagesModule {}
