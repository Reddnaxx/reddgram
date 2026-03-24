import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import {
  ChatsService,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  type MulterMemoryFile,
} from '../chats/chats.service.js';
import { MessagesGateway } from './messages.gateway.js';

type AuthedRequest = Request & {
  user: {
    id: string;
    phone: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

@Controller('chats')
export class ChatFilesController {
  constructor(
    private readonly chats: ChatsService,
    private readonly gateway: MessagesGateway,
  ) {}

  @Post(':chatId/messages/files')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_MESSAGE, {
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async uploadMessageFiles(
    @Req() req: AuthedRequest,
    @Param('chatId') chatId: string,
    @UploadedFiles() files: MulterMemoryFile[] | undefined,
    @Body('content') content?: string,
  ) {
    const msg = await this.chats.sendMessageWithFiles(
      chatId,
      req.user.id,
      content,
      files,
    );
    const dto = this.chats.toMessageDto(msg);
    await this.gateway.broadcastNewMessage(chatId, dto);
    return dto;
  }
}
