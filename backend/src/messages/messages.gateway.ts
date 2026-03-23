import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatsService } from '../chats/chats.service.js';

type HandshakeAuth = { token?: string };

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chats: ChatsService,
  ) {}

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
      (client.data as { userId: string }).userId = payload.sub;
    } catch {
      client.disconnect();
    }
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
    const dto = {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
    this.server.to(`chat:${chatId}`).emit('newMessage', dto);
    return { ok: true as const, id: msg.id };
  }
}
