import { AppState, Platform } from 'react-native';
import { API_PREFIX, getBackendApiBaseUrl } from '../constants/config';

// Names are compile-time categories only. Never send route params, URLs or user content.
export const MONITORED_SCREENS = new Set('Splash Welcome Login SetupWelcome Questionnaire AnalysisLoading AnalysisReport TrainerMatch PaymentRequired ProfileSetup PaymentSync PaidWelcome FindingTrainer PlanPreparing Renewal WorkoutList WorkoutHistory WorkoutHistoryDetail Coach PlanRefresh WorkoutSummary WorkoutDetail WorkoutVideo Diet Action ProgressMain ProgressReport ProgressReportHistory TrophyDetails ProfileMain EditProfile GymPicker Trainer Legal DeleteAccount'.split(' '));
const API_FAMILIES = new Set('auth status profile questionnaire analysis plans workouts workout exercise videos diet progress checkins check-ins accountability trophies trainer bookings messages settings gym gyms notifications activity reports access renewal onboarding payment payments body-logs history feedback'.split(' '));
type EventType = 'screen_view' | 'screen_time' | 'session_start' | 'api_request' | 'image_load' | 'image_error' | 'article_open' | 'notification_permission' | 'notification_open' | 'feature_view';
type Event = { id: string; type: EventType; name: string; screen: string; session: string; platform: 'ios' | 'android'; durationMs: number; status: string; at: string };
let token: string | null = null;
let session = '';
let queue: Event[] = [];
let screen = '';
let feature = '';
let since = 0;
let backgroundedAt = 0;
let foreground = true;
let timer: ReturnType<typeof setInterval> | undefined;
let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
let busy = false;
let pausedUntil = 0;
let requestController: AbortController | undefined;
const identifier = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;

export function observeAppEvent(type: EventType, name: string, durationMs = 0, status = '') {
  if (!token || !foreground || Date.now() < pausedUntil || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
  if (type === 'feature_view') {
    if (feature === name) return;
    feature = name;
  }
  if (queue.length >= 80) return; // Bounded, best-effort diagnostics; never delay a user action.
  queue.push({ id: identifier(), type, name, screen, session, platform: Platform.OS, durationMs: Math.min(1800000, Math.max(0, Math.round(durationMs))), status, at: new Date().toISOString() });
}

function finishScreen() {
  if (screen && since) observeAppEvent('screen_time', screen, Date.now() - since);
  since = 0;
}

export function observeScreen(path: string) {
  const next = path.split('/').filter(Boolean).pop() || '';
  if (!token || !MONITORED_SCREENS.has(next) || next === screen) return;
  finishScreen();
  screen = next;
  feature = '';
  since = foreground ? Date.now() : 0;
  observeAppEvent('screen_view', screen);
}

export function configureMonitoring(nextToken: string | null) {
  if (nextToken === token) return;
  requestController?.abort();
  token = nextToken;
  queue = [];
  screen = '';
  feature = '';
  since = 0;
  pausedUntil = 0;
  backgroundedAt = 0;
  if (timer) clearInterval(timer);
  subscription?.remove();
  timer = undefined;
  subscription = undefined;
  if (!token) return;
  session = identifier();
  foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
  observeAppEvent('session_start', 'app');
  timer = setInterval(() => { flushMonitoring().catch(() => undefined); }, 30000);
  subscription = AppState.addEventListener('change', state => {
    if (state !== 'active' && foreground) {
      finishScreen();
      backgroundedAt = Date.now();
      foreground = false;
      flushMonitoring().catch(() => undefined);
    } else if (state === 'active' && !foreground) {
      foreground = true;
      feature = '';
      if (Date.now() - backgroundedAt >= 30 * 60000) {
        session = identifier();
        observeAppEvent('session_start', 'app');
      }
      if (screen) {
        since = Date.now();
        observeAppEvent('screen_view', screen);
      }
    }
  });
}

export async function flushMonitoring() {
  if (!token || busy || !queue.length || Date.now() < pausedUntil) return;
  const owner = token;
  const batch = queue.splice(0, 40);
  busy = true;
  const controller = new AbortController();
  requestController = controller;
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${getBackendApiBaseUrl()}${API_PREFIX}/telemetry`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }), signal: controller.signal,
    });
    if (owner !== token) return;
    if (response.status === 429) {
      const retry = Number(response.headers.get('Retry-After')) || 300;
      pausedUntil = Date.now() + Math.min(86400, Math.max(30, retry)) * 1000;
      queue = [];
    } else if (response.ok) {
      const result = await response.json();
      if (owner === token && result.enabled === false) { pausedUntil = Date.now() + 5 * 60000; queue = []; }
    } else {
      pausedUntil = Date.now() + 60000;
    }
  } catch { /* Telemetry never retries or changes app behaviour. */ }
  finally { clearTimeout(timeout); busy = false; }
}

export function observeApiResult(path: string, durationMs: number, status: number, owner: string | null) {
  if (!owner || owner !== token || path.startsWith('/telemetry') || path.startsWith('/activity')) return;
  const family = path.split(/[/?#]/).filter(Boolean)[0] || 'other';
  observeAppEvent('api_request', API_FAMILIES.has(family) ? family : 'other', durationMs,
    status === 0 ? 'network_error' : status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : 'ok');
}
