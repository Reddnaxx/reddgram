import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatsModule } from '../chats/chats.module.js';
import { ChatFilesController } from './chat-files.controller.js';
import { MessagesGateway } from './messages.gateway.js';
import { PresenceService } from './presence.service.js';

@Module({
  imports: [AuthModule, ChatsModule],
  controllers: [ChatFilesController],
  providers: [PresenceService, MessagesGateway],
})
export class MessagesModule {}
