import { apiRequest } from './apiClient';
import type { Message } from '../types/api';

export async function fetchMessages() {
  return apiRequest<{ messages: Message[]; planId: string }>('/messages');
}

export async function sendMessage(text: string, planId?: string) {
  return apiRequest<{ ok: boolean; message: Message }>('/messages', {
    method: 'POST',
    body: { text, planId },
  });
}
