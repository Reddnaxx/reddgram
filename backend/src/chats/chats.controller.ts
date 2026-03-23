import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ChatsService } from './chats.service.js';
import { CreateChatDto } from './dto/create-chat.dto.js';

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
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: AuthedRequest, @Body() dto: CreateChatDto) {
    return this.chats.getOrCreateDm(req.user.id, dto.peerUserId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  list(@Req() req: AuthedRequest) {
    return this.chats.listChats(req.user.id);
  }

  @Get(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  messages(
    @Req() req: AuthedRequest,
    @Param('id') chatId: string,
    @Query('cursor') cursor?: string,
    @Query('take') takeRaw?: string,
  ) {
    const take = takeRaw ? parseInt(takeRaw, 10) : undefined;
    return this.chats.getMessages(
      chatId,
      req.user.id,
      cursor,
      Number.isFinite(take) ? take : undefined,
    );
  }
}
