import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
  TimestampTrigger,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { apiRequest } from './apiClient';

const CHANNEL_ID = 'formbae-reminders';

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

function nextDailyTimestamp(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function nextWeeklyTimestamp(weekday: number, hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  const diff = (weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + diff);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next.getTime();
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

  await notifee.cancelTriggerNotification(IDS.workout);
  await notifee.cancelTriggerNotification(IDS.checkIn);
  await notifee.cancelTriggerNotification(IDS.trainer);

  if (prefs.workoutReminders) {
    await scheduleReminder(
      IDS.workout,
      'Time to train',
      'Your FormBae workout is waiting. A short session keeps your streak alive.',
      nextDailyTimestamp(8, 0),
      RepeatFrequency.DAILY,
    );
  }

  if (prefs.weeklyCheckInReminders) {
    await scheduleReminder(
      IDS.checkIn,
      'Weekly check-in due',
      'Share your weight, energy, and notes so your trainer can adjust your plan.',
      nextWeeklyTimestamp(0, 18, 0),
      RepeatFrequency.WEEKLY,
    );
  }

  if (prefs.trainerMessageReminders) {
    await scheduleReminder(
      IDS.trainer,
      'Message your trainer',
      'Have a question? Your FormBae trainer is one message away.',
      nextDailyTimestamp(19, 30),
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
