/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// Handle notification interactions while the app is in the background/quit.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS && detail.notification?.id) {
    // No-op: pressing a reminder simply opens the app.
  }
});

AppRegistry.registerComponent(appName, () => App);
