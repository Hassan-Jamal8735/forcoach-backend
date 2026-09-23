import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStateEntry = { userId: string; returnTo: string | null };

@Injectable()
export class GoogleOAuthStateService {
  private readonly pending = new Map<
    string,
    OAuthStateEntry & { expiresAt: number }
  >();

  create(userId: string, returnTo: string | null = null): string {
    const nonce = randomUUID();
    this.pending.set(nonce, {
      userId,
      returnTo,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    return nonce;
  }

  consume(nonce: string): OAuthStateEntry | null {
    const entry = this.pending.get(nonce);
    this.pending.delete(nonce);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return { userId: entry.userId, returnTo: entry.returnTo };
  }
}
