import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { Message } from '../types/api';

export async function fetchMessages() {
  return apiRequest<{ messages: Message[]; planId: string }>('/messages');
}

export async function sendMessage(text: string, planId?: string) {
  const response = await apiRequest<{ ok: boolean; message: Message }>('/messages', {
    method: 'POST',
    body: { text, planId },
  });
  invalidateCachedResource('coachBundle');
  return response;
}
