import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { computeDmPairKey } from '../common/lib/dm.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

  async getParticipantUserIds(chatId: string): Promise<string[]> {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
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

    const chatIds = items.map((i) => i.id);
    if (chatIds.length === 0) {
      return [];
    }
    const unreadGroups = await this.prisma.message.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chatIds },
        senderId: { not: userId },
        readAt: null,
      },
      _count: { _all: true },
    });
    const unreadMap = new Map(
      unreadGroups.map((g) => [g.chatId, g._count._all]),
    );

    return items.map((item) => ({
      ...item,
      unreadCount: unreadMap.get(item.id) ?? 0,
    }));
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
        messages: messages.map((m) => this.toMessageDto(m)),
        nextCursor: rows.length === limit ? (messages[0]?.id ?? null) : null,
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
            AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const messages = older.slice().reverse();
    return {
      messages: messages.map((m) => this.toMessageDto(m)),
      nextCursor: older.length === limit ? (messages[0]?.id ?? null) : null,
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

  async ackDelivered(chatId: string, userId: string, messageId: string) {
    await this.ensureParticipant(chatId, userId);
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
    });
    if (!msg) {
      throw new NotFoundException('Message not found');
    }
    if (msg.senderId === userId) {
      throw new BadRequestException('Cannot ack own message');
    }
    const now = new Date();
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deliveredAt: msg.deliveredAt ?? now },
    });
    return this.toMessageDto(updated);
  }

  /** Помечает прочитанными все сообщения от собеседника вплоть до якоря (включительно). */
  async markReadUpTo(chatId: string, readerId: string, messageId: string) {
    await this.ensureParticipant(chatId, readerId);
    const anchor = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
    });
    if (!anchor) {
      throw new BadRequestException('Invalid message');
    }
    if (anchor.senderId === readerId) {
      throw new BadRequestException('Cannot mark own messages as read');
    }

    const rows = await this.prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: readerId },
        readAt: null,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          {
            AND: [
              { createdAt: anchor.createdAt },
              { id: { lte: anchor.id } },
            ],
          },
        ],
      },
    });
    if (rows.length === 0) {
      return [];
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.message.update({
          where: { id: row.id },
          data: {
            readAt: now,
            deliveredAt: row.deliveredAt ?? now,
          },
        }),
      ),
    );
    return updated.map((m) => this.toMessageDto(m));
  }

  toMessageDto(m: {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    createdAt: Date;
    deliveredAt: Date | null;
    readAt: Date | null;
  }) {
    return {
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
    };
  }
}
