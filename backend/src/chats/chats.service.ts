import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeDmPairKey } from '../common/lib/dm.js';

export const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureParticipant(chatId: string, userId: string): Promise<void> {
    const row = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!row) {
      throw new ForbiddenException('Not a participant of this chat');
    }
  }

  async getOrCreateDm(userId: string, peerUserId: string) {
    if (userId === peerUserId) {
      throw new BadRequestException('Cannot start a chat with yourself');
    }
    const peer = await this.prisma.user.findUnique({
      where: { id: peerUserId },
      select: {
        id: true,
        phone: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!peer) {
      throw new NotFoundException('User not found');
    }
    const dmPairKey = computeDmPairKey(userId, peerUserId);
    let chat = await this.prisma.chat.findUnique({
      where: { dmPairKey },
    });
    if (!chat) {
      chat = await this.prisma.chat.create({
        data: {
          dmPairKey,
          participants: {
            create: [{ userId }, { userId: peerUserId }],
          },
        },
      });
    }
    return { id: chat.id, peer };
  }

  async listChats(userId: string) {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    phone: true,
                    username: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { content: true, createdAt: true },
            },
          },
        },
      },
    });

    const items = rows.map((r) => {
      const peerParticipant = r.chat.participants.find(
        (p) => p.userId !== userId,
      );
      const peer = peerParticipant?.user ?? null;
      const last = r.chat.messages[0];
      return {
        id: r.chat.id,
        peer: peer
          ? {
              id: peer.id,
              phone: peer.phone,
              username: peer.username,
              firstName: peer.firstName,
              lastName: peer.lastName,
            }
          : null,
        lastMessage: last
          ? { content: last.content, createdAt: last.createdAt.toISOString() }
          : null,
      };
    });

    items.sort((a, b) => {
      const ta = a.lastMessage
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tb = b.lastMessage
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tb - ta;
    });

    return items;
  }

  async getMessages(
    chatId: string,
    userId: string,
    cursor?: string,
    take = DEFAULT_PAGE_SIZE,
  ) {
    await this.ensureParticipant(chatId, userId);
    const limit = Math.min(Math.max(take, 1), MAX_PAGE_SIZE);

    if (!cursor) {
      const rows = await this.prisma.message.findMany({
        where: { chatId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      const messages = rows.slice().reverse();
      return {
        messages: messages.map(this.toMessageDto),
        nextCursor:
          rows.length === limit ? (messages[0]?.id ?? null) : null,
      };
    }

    const anchor = await this.prisma.message.findFirst({
      where: { id: cursor, chatId },
    });
    if (!anchor) {
      throw new BadRequestException('Invalid cursor');
    }

    const older = await this.prisma.message.findMany({
      where: {
        chatId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          {
            AND: [
              { createdAt: anchor.createdAt },
              { id: { lt: anchor.id } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const messages = older.slice().reverse();
    return {
      messages: messages.map(this.toMessageDto),
      nextCursor:
        older.length === limit ? (messages[0]?.id ?? null) : null,
    };
  }

  async sendMessage(chatId: string, senderId: string, content: string) {
    const trimmed = content?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException('Message too long');
    }
    await this.ensureParticipant(chatId, senderId);
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        content: trimmed,
      },
    });
    return message;
  }

  private toMessageDto(m: {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
