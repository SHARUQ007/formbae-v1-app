import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
  TimestampTrigger,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRequest } from './apiClient';

const CHANNEL_ID = 'formbae-reminders';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const IDS = {
  workout: 'reminder-workout',
  checkIn: 'reminder-checkin',
  trainer: 'reminder-trainer',
};

export type NotificationPrefs = {
  workoutReminders: boolean;
  weeklyCheckInReminders: boolean;
  trainerMessageReminders: boolean;
};

type NotificationTemplate = {
  enabled: boolean;
  title: string;
  body: string;
  timeHHMM: string;
  weekday?: number;
};

type NotificationConfig = {
  workout: NotificationTemplate;
  checkIn: NotificationTemplate;
  trainer: NotificationTemplate;
  behavioral: Record<BehavioralNotificationEvent, BehavioralNotificationTemplate>;
};

export type BehavioralNotificationEvent = 'workoutComplete' | 'dietPhotoLogged' | 'checkInSubmitted' | 'paymentConfirmed' | 'planReady';

type BehavioralNotificationTemplate = {
  enabled: boolean;
  title: string;
  body: string;
  cooldownHours: number;
};

const DEFAULT_CONFIG: NotificationConfig = {
  workout: {
    enabled: true,
    title: 'Time to train',
    body: 'Your FormBae workout is waiting. A short session keeps your streak alive.',
    timeHHMM: '08:00',
  },
  checkIn: {
    enabled: true,
    title: 'Weekly check-in due',
    body: 'Share your weight, energy, and notes so your trainer can adjust your plan.',
    timeHHMM: '18:00',
    weekday: 0,
  },
  trainer: {
    enabled: true,
    title: 'Message your trainer',
    body: 'Have a question? Your FormBae trainer is one message away.',
    timeHHMM: '19:30',
  },
  behavioral: {
    workoutComplete: {
      enabled: true,
      title: 'Workout logged',
      body: 'Great work, {firstName}. Your trainer can now see today’s progress.',
      cooldownHours: 2,
    },
    dietPhotoLogged: {
      enabled: true,
      title: 'Meal saved',
      body: '{mealType} added to your diet diary. Keep the streak going.',
      cooldownHours: 2,
    },
    checkInSubmitted: {
      enabled: true,
      title: 'Check-in sent',
      body: 'Your trainer has your latest update and can adjust your plan if needed.',
      cooldownHours: 12,
    },
    paymentConfirmed: {
      enabled: true,
      title: 'Payment confirmed',
      body: 'Your FormBae trainer-backed plan is being prepared.',
      cooldownHours: 24,
    },
    planReady: {
      enabled: true,
      title: 'Your plan is ready',
      body: 'Your trainer has published your workout plan. Open FormBae to begin.',
      cooldownHours: 12,
    },
  },
};

export async function ensureNotificationSetup(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  const granted =
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'FormBae Reminders',
      importance: AndroidImportance.HIGH,
    });
  }
  return granted;
}

function parseTimeHHMM(value: string, fallback: string) {
  const raw = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : fallback;
  const [hour, minute] = raw.split(':').map((part) => Number(part));
  return { hour, minute };
}

async function fetchNotificationConfig(): Promise<NotificationConfig> {
  try {
    const response = await apiRequest<{ config: NotificationConfig }>('/notifications/config');
    return {
      workout: { ...DEFAULT_CONFIG.workout, ...response.config.workout },
      checkIn: { ...DEFAULT_CONFIG.checkIn, ...response.config.checkIn },
      trainer: { ...DEFAULT_CONFIG.trainer, ...response.config.trainer },
      behavioral: {
        workoutComplete: { ...DEFAULT_CONFIG.behavioral.workoutComplete, ...response.config.behavioral?.workoutComplete },
        dietPhotoLogged: { ...DEFAULT_CONFIG.behavioral.dietPhotoLogged, ...response.config.behavioral?.dietPhotoLogged },
        checkInSubmitted: { ...DEFAULT_CONFIG.behavioral.checkInSubmitted, ...response.config.behavioral?.checkInSubmitted },
        paymentConfirmed: { ...DEFAULT_CONFIG.behavioral.paymentConfirmed, ...response.config.behavioral?.paymentConfirmed },
        planReady: { ...DEFAULT_CONFIG.behavioral.planReady, ...response.config.behavioral?.planReady },
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function getIstWallDate(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS);
}

function istWallTimeToUtcTimestamp(year: number, monthIndex: number, day: number, hour: number, minute: number) {
  return Date.UTC(year, monthIndex, day, hour, minute, 0, 0) - IST_OFFSET_MS;
}

function nextDailyIstTimestamp(hour: number, minute: number): number {
  const now = Date.now();
  const ist = getIstWallDate(now);
  let timestamp = istWallTimeToUtcTimestamp(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, minute);
  if (timestamp <= now) {
    timestamp = istWallTimeToUtcTimestamp(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, hour, minute);
  }
  return timestamp;
}

function nextWeeklyIstTimestamp(weekday: number, hour: number, minute: number): number {
  const now = Date.now();
  const ist = getIstWallDate(now);
  const currentWeekday = ist.getUTCDay();
  let diff = (weekday - currentWeekday + 7) % 7;
  let timestamp = istWallTimeToUtcTimestamp(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + diff, hour, minute);
  if (timestamp <= now) {
    diff += 7;
    timestamp = istWallTimeToUtcTimestamp(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + diff, hour, minute);
  }
  return timestamp;
}

async function scheduleReminder(id: string, title: string, body: string, timestamp: number, repeat: RepeatFrequency) {
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp,
    repeatFrequency: repeat,
    // Inexact alarm: no SCHEDULE_EXACT_ALARM permission / Play policy declaration needed.
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(
    {
      id,
      title,
      body,
      android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
    },
    trigger,
  );
}

/**
 * Reconciles scheduled local reminders with the user's preferences.
 * Local notifications work fully offline without any push infrastructure.
 */
export async function syncReminders(prefs: NotificationPrefs): Promise<void> {
  const granted = await ensureNotificationSetup();
  if (!granted) return;
  const config = await fetchNotificationConfig();

  await notifee.cancelTriggerNotification(IDS.workout);
  await notifee.cancelTriggerNotification(IDS.checkIn);
  await notifee.cancelTriggerNotification(IDS.trainer);

  if (prefs.workoutReminders && config.workout.enabled) {
    const { hour, minute } = parseTimeHHMM(config.workout.timeHHMM, DEFAULT_CONFIG.workout.timeHHMM);
    await scheduleReminder(
      IDS.workout,
      config.workout.title,
      config.workout.body,
      nextDailyIstTimestamp(hour, minute),
      RepeatFrequency.DAILY,
    );
  }

  if (prefs.weeklyCheckInReminders && config.checkIn.enabled) {
    const { hour, minute } = parseTimeHHMM(config.checkIn.timeHHMM, DEFAULT_CONFIG.checkIn.timeHHMM);
    await scheduleReminder(
      IDS.checkIn,
      config.checkIn.title,
      config.checkIn.body,
      nextWeeklyIstTimestamp(config.checkIn.weekday ?? 0, hour, minute),
      RepeatFrequency.WEEKLY,
    );
  }

  if (prefs.trainerMessageReminders && config.trainer.enabled) {
    const { hour, minute } = parseTimeHHMM(config.trainer.timeHHMM, DEFAULT_CONFIG.trainer.timeHHMM);
    await scheduleReminder(
      IDS.trainer,
      config.trainer.title,
      config.trainer.body,
      nextDailyIstTimestamp(hour, minute),
      RepeatFrequency.DAILY,
    );
  }
}

export async function displayLocalNotification(title: string, body: string): Promise<void> {
  await ensureNotificationSetup();
  await notifee.displayNotification({
    title,
    body,
    android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
  });
}

function renderTemplate(value: string, variables: Record<string, string> = {}) {
  return value.replace(/\{(\w+)\}/g, (_match, key: string) => variables[key] || '');
}

async function canSendBehavioral(event: BehavioralNotificationEvent, cooldownHours: number) {
  if (cooldownHours <= 0) return true;
  const key = `formbae_behavioral_notification:${event}`;
  const lastRaw = await AsyncStorage.getItem(key);
  const last = lastRaw ? Number(lastRaw) : 0;
  const now = Date.now();
  if (last && now - last < cooldownHours * 60 * 60 * 1000) return false;
  await AsyncStorage.setItem(key, String(now));
  return true;
}

export async function displayBehavioralNotification(
  event: BehavioralNotificationEvent,
  variables: Record<string, string> = {},
): Promise<void> {
  const config = await fetchNotificationConfig();
  const template = config.behavioral[event];
  if (!template?.enabled) return;
  const allowed = await canSendBehavioral(event, template.cooldownHours ?? 0);
  if (!allowed) return;
  await displayLocalNotification(renderTemplate(template.title, variables), renderTemplate(template.body, variables));
}

/**
 * Optional remote push (FCM/APNs). @react-native-firebase/messaging is an OPTIONAL
 * dependency: install it and drop in google-services.json / GoogleService-Info.plist
 * to enable server-sent push. Until then this no-ops so the app stays stable.
 */
export async function registerForRemotePush(): Promise<void> {
  try {
    const messagingModule = require('@react-native-firebase/messaging');
    const messaging = messagingModule.default || messagingModule;
    const authStatus = await messaging().requestPermission();
    const enabled = authStatus === 1 || authStatus === 2;
    if (!enabled) return;
    const token = await messaging().getToken();
    if (token) {
      await apiRequest('/notifications/register', {
        method: 'POST',
        body: { token, platform: Platform.OS },
      });
    }
  } catch {
    // Firebase messaging not installed / not configured — remote push disabled.
  }
}
