import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isFullPhoneDigitLength,
  isPhoneLikeSearchQuery,
  normalizePhone,
} from '../common/lib/phone.js';
import {
  normalizeUsername,
  USERNAME_PATTERN,
} from '../common/lib/username.js';

const SEARCH_LIMIT = 20;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async checkUsernameAvailability(raw: string) {
    const u = normalizeUsername(raw);
    if (!u || !USERNAME_PATTERN.test(u)) {
      throw new BadRequestException('Invalid username');
    }
    const existing = await this.prisma.user.findUnique({
      where: { username: u },
    });
    return { available: !existing };
  }

  async search(currentUserId: string, rawQuery: string) {
    const q = rawQuery.trim();
    if (!q) {
      return [];
    }
    const digits = normalizePhone(q);
    if (isPhoneLikeSearchQuery(q) && isFullPhoneDigitLength(digits)) {
      return this.prisma.user.findMany({
        where: {
          id: { not: currentUserId },
          phone: { startsWith: digits },
        },
        select: {
          id: true,
          phone: true,
          username: true,
          firstName: true,
          lastName: true,
        },
        take: SEARCH_LIMIT,
      });
    }
    const term = normalizeUsername(q);
    const rawTrim = q.trim();
    const orFilters: Array<Record<string, unknown>> = [];
    if (term) {
      orFilters.push({ username: { contains: term } });
    }
    orFilters.push({ firstName: { contains: rawTrim } });
    orFilters.push({ lastName: { contains: rawTrim } });
    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: orFilters,
      },
      select: {
        id: true,
        phone: true,
        username: true,
        firstName: true,
        lastName: true,
      },
      take: SEARCH_LIMIT,
    });
  }
}
