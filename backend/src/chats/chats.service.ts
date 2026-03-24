import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Prisma } from '../../generated/prisma/client.js';
import { computeDmPairKey } from '../common/lib/dm.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILES_PER_MESSAGE = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type MessageAttachmentDto = {
  kind: 'image' | 'file';
  url: string;
  mimeType: string;
  fileName: string;
};

/** Файл из memoryStorage multer (Nest FilesInterceptor). */
export type MulterMemoryFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
};

function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? '.bin';
}

function safeDisplayName(original: string | undefined): string {
  const base = basename(original ?? 'file').replace(/[/\\]/g, '');
  const trimmed = base.slice(0, 200);
  return trimmed || 'file';
}

export function normalizeAttachments(
  raw: unknown,
): MessageAttachmentDto[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: MessageAttachmentDto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o.kind !== 'image' && o.kind !== 'file') continue;
    const url = o.url;
    const mimeType = o.mimeType;
    const fileName = o.fileName;
    if (typeof url !== 'string' || typeof mimeType !== 'string') continue;
    if (typeof fileName !== 'string') continue;
    out.push({
      kind: o.kind,
      url,
      mimeType,
      fileName,
    });
  }
  return out.length > 0 ? out : null;
}

export function formatChatListLastContent(
  content: string,
  attachments: unknown,
): string {
  const trimmed = content.trim();
  if (trimmed) return trimmed;
  const parsed = normalizeAttachments(attachments);
  if (!parsed?.length) return '';
  if (parsed.length === 1) {
    const a = parsed[0];
    return a.kind === 'image' ? 'Фото' : `Файл: ${a.fileName}`;
  }
  return `Вложения (${parsed.length})`;
}

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private uploadRootAbs(): string {
    const dir = this.config.getOrThrow<string>('app.uploadDir');
    return resolve(process.cwd(), dir);
  }

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

  /** Уникальные userId собеседников по всем чатам пользователя. */
  async getDistinctPeerUserIds(userId: string): Promise<string[]> {
    const mine = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { chatId: true },
    });
    if (mine.length === 0) return [];
    const chatIds = mine.map((m) => m.chatId);
    const others = await this.prisma.chatParticipant.findMany({
      where: { chatId: { in: chatIds }, userId: { not: userId } },
      select: { userId: true },
    });
    return [...new Set(others.map((o) => o.userId))];
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
              select: { content: true, createdAt: true, attachments: true },
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
          ? {
              content: formatChatListLastContent(
                last.content,
                last.attachments,
              ),
              createdAt: last.createdAt.toISOString(),
            }
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

  async sendMessageWithFiles(
    chatId: string,
    senderId: string,
    content: string | undefined,
    files: MulterMemoryFile[] | undefined,
  ) {
    const list = files?.filter((f) => f?.size > 0) ?? [];
    if (list.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    if (list.length > MAX_FILES_PER_MESSAGE) {
      throw new BadRequestException('Too many files');
    }
    const trimmed = content?.trim() ?? '';
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException('Message too long');
    }
    await this.ensureParticipant(chatId, senderId);

    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        throw new BadRequestException('File too large');
      }
      if (!ALLOWED_MIMES.has(f.mimetype)) {
        throw new BadRequestException('File type not allowed');
      }
    }

    const root = this.uploadRootAbs();
    const chatDir = join(root, chatId);
    await mkdir(chatDir, { recursive: true });

    const attachments: MessageAttachmentDto[] = [];
    for (const f of list) {
      const ext = extname(f.originalname || '') || extForMime(f.mimetype);
      const storedName = `${randomUUID()}${ext}`;
      const diskPath = join(chatDir, storedName);
      await writeFile(diskPath, f.buffer);
      const url = `/uploads/${chatId}/${storedName}`;
      const kind: 'image' | 'file' = f.mimetype.startsWith('image/')
        ? 'image'
        : 'file';
      attachments.push({
        kind,
        url,
        mimeType: f.mimetype,
        fileName: safeDisplayName(f.originalname),
      });
    }

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        content: trimmed,
        attachments: attachments as unknown as Prisma.InputJsonValue,
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
            AND: [{ createdAt: anchor.createdAt }, { id: { lte: anchor.id } }],
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
    attachments?: Prisma.JsonValue | null;
    createdAt: Date;
    deliveredAt: Date | null;
    readAt: Date | null;
  }) {
    return {
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      content: m.content,
      attachments: normalizeAttachments(m.attachments ?? null),
      createdAt: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
    };
  }
}
