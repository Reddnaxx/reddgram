import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatsService } from '../chats/chats.service.js';
import { PresenceService } from './presence.service.js';

type HandshakeAuth = { token?: string };

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chats: ChatsService,
    private readonly presence: PresenceService,
  ) {}

  async broadcastNewMessage(
    chatId: string,
    dto: ReturnType<ChatsService['toMessageDto']>,
  ): Promise<void> {
    const participantIds = await this.chats.getParticipantUserIds(chatId);
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('newMessage', dto);
    }
  }

  async handleConnection(client: Socket) {
    const auth = client.handshake.auth as HandshakeAuth;
    const raw =
      auth?.token ??
      String(client.handshake.headers.authorization ?? '').replace(
        /^Bearer\s+/i,
        '',
      );
    if (!raw) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(raw);
      if (!payload?.sub) throw new Error('invalid');
      const userId = payload.sub;
      (client.data as { userId: string }).userId = userId;
      await client.join(`user:${userId}`);

      const becameOnline = this.presence.addSocket(userId);
      const peerIds = await this.chats.getDistinctPeerUserIds(userId);
      if (becameOnline) {
        for (const peerId of peerIds) {
          this.server
            .to(`user:${peerId}`)
            .emit('peerPresence', { userId, online: true as const });
        }
      }
      const onlineUserIds = this.presence.onlineUserIdsAmong(peerIds);
      this.server
        .to(`user:${userId}`)
        .emit('presenceSnapshot', { onlineUserIds });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return;
    const becameOffline = this.presence.removeSocket(userId);
    if (!becameOffline) return;
    void this.chats.getDistinctPeerUserIds(userId).then((peerIds) => {
      for (const peerId of peerIds) {
        this.server
          .to(`user:${peerId}`)
          .emit('peerPresence', { userId, online: false as const });
      }
    });
  }

  @SubscribeMessage('joinChat')
  async joinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId?: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) throw new WsException('Unauthorized');
    const chatId = body?.chatId;
    if (!chatId) throw new WsException('chatId required');
    await this.chats.ensureParticipant(chatId, userId);
    await client.join(`chat:${chatId}`);
    return { ok: true as const };
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId?: string; content?: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) throw new WsException('Unauthorized');
    const chatId = body?.chatId;
    const content = body?.content;
    if (!chatId || typeof content !== 'string') {
      throw new WsException('chatId and content required');
    }
    const msg = await this.chats.sendMessage(chatId, userId, content);
    const dto = this.chats.toMessageDto(msg);
    await this.broadcastNewMessage(chatId, dto);
    return { ok: true as const, message: dto };
  }

  @SubscribeMessage('ackDelivered')
  async ackDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId?: string; messageId?: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) throw new WsException('Unauthorized');
    const chatId = body?.chatId;
    const messageId = body?.messageId;
    if (!chatId || !messageId) {
      throw new WsException('chatId and messageId required');
    }
    try {
      const dto = await this.chats.ackDelivered(chatId, userId, messageId);
      this.server
        .to(`user:${dto.senderId}`)
        .emit('messageStatus', { updates: [dto] });
      return { ok: true as const };
    } catch (e: unknown) {
      if (e instanceof NotFoundException) {
        throw new WsException('Message not found');
      }
      if (e instanceof BadRequestException) {
        throw new WsException(e.message);
      }
      if (e instanceof ForbiddenException) {
        throw new WsException('Forbidden');
      }
      throw e;
    }
  }

  @SubscribeMessage('markRead')
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId?: string; messageId?: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) throw new WsException('Unauthorized');
    const chatId = body?.chatId;
    const messageId = body?.messageId;
    if (!chatId || !messageId) {
      throw new WsException('chatId and messageId required');
    }
    try {
      const updates = await this.chats.markReadUpTo(chatId, userId, messageId);
      if (updates.length > 0) {
        const notify = new Set<string>();
        for (const u of updates) {
          notify.add(u.senderId);
        }
        for (const sid of notify) {
          const subset = updates.filter((u) => u.senderId === sid);
          this.server.to(`user:${sid}`).emit('messageStatus', { updates: subset });
        }
      }
      return { ok: true as const };
    } catch (e: unknown) {
      if (e instanceof BadRequestException) {
        throw new WsException(e.message);
      }
      if (e instanceof ForbiddenException) {
        throw new WsException('Forbidden');
      }
      throw e;
    }
  }
}
