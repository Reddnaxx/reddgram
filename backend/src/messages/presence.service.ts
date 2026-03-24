import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private readonly counts = new Map<string, number>();

  /** true, если пользователь впервые стал онлайн (0 → 1 сокет). */
  addSocket(userId: string): boolean {
    const next = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, next);
    return next === 1;
  }

  /** true, если пользователь полностью ушёл офлайн (последний сокет). */
  removeSocket(userId: string): boolean {
    const prev = this.counts.get(userId) ?? 0;
    if (prev <= 0) return false;
    const next = prev - 1;
    if (next <= 0) {
      this.counts.delete(userId);
      return true;
    }
    this.counts.set(userId, next);
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.counts.get(userId) ?? 0) > 0;
  }

  onlineUserIdsAmong(ids: string[]): string[] {
    return ids.filter((id) => this.isOnline(id));
  }
}
