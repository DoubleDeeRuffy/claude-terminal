import crypto from 'crypto';
import { store } from '../store/store';

const API_KEY_PREFIX = 'ctc_';
const API_KEY_LENGTH = 32;

export function generateApiKey(): string {
  const random = crypto.randomBytes(API_KEY_LENGTH).toString('hex');
  return `${API_KEY_PREFIX}${random}`;
}

export function isValidApiKeyFormat(key: string): boolean {
  return typeof key === 'string' && key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_PREFIX.length + API_KEY_LENGTH * 2;
}

export function generateRoomSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function authenticateApiKey(key: string): Promise<string | null> {
  if (!isValidApiKeyFormat(key)) return null;
  const users = await store.listUsers();
  for (const userName of users) {
    const user = await store.getUser(userName);
    if (user && user.apiKey === key) return user.name;
  }
  return null;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}
