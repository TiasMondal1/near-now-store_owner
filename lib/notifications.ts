/**
 * Push notification service for store owner app
 * Handles registration, permissions, and notification display
 */

import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from './api-client';
import { getSession } from '../session';
import { emitOrdersChanged } from './orderEvents';
import { emitDemoOrder } from './demoOrderEvents';
import { DEV_TOOLS_AVAILABLE } from './devToolsFlag';
import { LOCK_SCREEN_ALERTS_AVAILABLE, cancelLockScreenAlerts, setupLockScreenAlertHandling } from './lockScreenAlert';
import { NEW_ORDER_BACKGROUND_TASK } from './backgroundNotifications';
import { stopOrderListener } from './orderListenerService';

const PUSH_TOKEN_KEY = 'push_notification_token';
const NOTIFICATION_PREFERENCES_KEY = 'notification_preferences';

// expo-notifications push support was removed from Expo Go in SDK 53.
// Load the module conditionally so the auto-registration side-effect
// (DevicePushTokenAutoRegistration.fx.js) never runs inside Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

type ExpoNotifications = typeof import('expo-notifications');
let Notifications: ExpoNotifications | null = null;

if (!IS_EXPO_GO) {
  try {
    // Skipped in Expo Go (no native module); resolved at runtime on purpose.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications') as ExpoNotifications;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    if (__DEV__) console.warn('[notifications] expo-notifications unavailable:', e);
    Notifications = null;
  }
}

// Previously also had dailySummary/payments/systemAlerts toggles, but no
// backend push feature has ever existed for any of them — removed rather
// than left as dead UI a shopkeeper could toggle with no effect, matching
// this codebase's own precedent for other never-built controls.
export interface NotificationPreferences {
  newOrders: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  newOrders: true,
};

class NotificationService {
  private static instance: NotificationService;
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;
  private readyPromise: Promise<void>;
  // Set right before every `return null` in registerForPushNotifications so
  // a caller (e.g. the "Enable" button) can show a specific, actionable
  // message instead of a silent no-op on failure.
  private lastRegistrationError:
    | 'expo-go'
    | 'not-device'
    | 'permission-denied'
    | 'token-failed'
    | 'unknown'
    | null = null;

  getLastRegistrationError() {
    return this.lastRegistrationError;
  }

  // Live OS notification listener subscriptions. initialize() runs on every
  // Home mount (each login), and without tracking these each mount stacked
  // another pair of listeners — one notification tap then pushed the Orders
  // screen once per accumulated listener.
  private receivedSub: { remove: () => void } | null = null;
  private responseSub: { remove: () => void } | null = null;
  private lastHandledLaunchTapId: string | null = null;

  private constructor() {
    this.readyPromise = this.loadPreferences();
  }

  /**
   * Resolves once persisted preferences have been loaded from AsyncStorage.
   * getPreferences() called before this resolves can return stale defaults —
   * callers that render preferences on mount should await this first.
   */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service
   */
  async initialize(): Promise<void> {
    try {
      await this.loadPreferences();

      if (IS_EXPO_GO) {
        if (__DEV__) console.log('[notifications] Skipping push setup: running in Expo Go');
        return;
      }

      // Only register on physical devices
      if (Device.isDevice) {
        await this.registerForPushNotifications();
        this.setupNotificationListeners();
        await this.setupBackgroundAlerts();
      } else {
        if (__DEV__) console.log('Notifications disabled: Not a physical device');
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to initialize notifications:', error);
      // Don't throw - app should work without notifications
    }
  }

  /**
   * Android lock-screen ringing alert (lib/lockScreenAlert.ts): route pushes
   * that arrive while backgrounded/killed through the headless task, listen
   * for Accept/Reject taps. The permissions themselves (full-screen, exact
   * alarm, battery) are handled by the Order alert setup screen
   * (lib/alertSetup). No-op where Notifee's native module is absent.
   */
  private backgroundAlertsReady = false;
  private async setupBackgroundAlerts(): Promise<void> {
    if (!Notifications || Platform.OS !== 'android' || !LOCK_SCREEN_ALERTS_AVAILABLE) return;
    if (!this.backgroundAlertsReady) {
      this.backgroundAlertsReady = true;
      try {
        await Notifications.registerTaskAsync(NEW_ORDER_BACKGROUND_TASK);
      } catch (e) {
        if (__DEV__) console.warn('[notifications] background task registration failed:', e);
      }
    }
    await setupLockScreenAlertHandling();
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications(): Promise<string | null> {
    this.lastRegistrationError = null;

    if (IS_EXPO_GO || !Notifications) {
      if (__DEV__) console.log('[notifications] Push registration skipped: Expo Go or module unavailable');
      this.lastRegistrationError = 'expo-go';
      return null;
    }

    if (!Device.isDevice) {
      if (__DEV__) console.log('Push notifications only work on physical devices');
      this.lastRegistrationError = 'not-device';
      return null;
    }

    try {
      if (Platform.OS === 'android') {
        // Channel id bumped to _v2: Android locks a channel's sound at
        // creation time, so a previously-created 'orders' channel can never
        // pick up order_chime.wav — only a new channel id does.
        await Notifications.setNotificationChannelAsync('orders_v2', {
          name: 'Order Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'order_chime.wav',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        if (__DEV__) console.log('Notification permissions not granted');
        this.lastRegistrationError = 'permission-denied';
        return null;
      }

      let token;
      try {
        token = await Notifications.getExpoPushTokenAsync();
      } catch (error: any) {
        if (__DEV__) console.warn('Could not get push token:', error?.message || error);
        this.lastRegistrationError = 'token-failed';
        return null;
      }

      if (!token?.data) {
        if (__DEV__) console.warn('No push token received');
        this.lastRegistrationError = 'token-failed';
        return null;
      }

      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);

      this.registerTokenWithBackend(token.data).catch((err) => {
        if (__DEV__) console.warn('Failed to register token with backend:', err);
      });
      this.startForegroundReRegistration();

      if (__DEV__) console.log('✅ Push notification token registered');
      return token.data;
    } catch (error: any) {
      if (__DEV__) console.warn('Push notification registration failed:', error?.message || error);
      this.lastRegistrationError = 'unknown';
      return null;
    }
  }

  /**
   * Register token with backend
   */
  // Re-send the stored token to the backend whenever the app returns to the
  // foreground (throttled). Registration used to be a single fire-and-forget
  // POST after login; if that one call failed the device got no pushes
  // until the next cold start. Registration is idempotent server-side.
  private appStateSub: { remove: () => void } | null = null;
  private lastRegisterAt = 0;
  private static readonly REREGISTER_THROTTLE_MS = 15 * 60 * 1000;

  private startForegroundReRegistration(): void {
    if (this.appStateSub) return;
    this.appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - this.lastRegisterAt < NotificationService.REREGISTER_THROTTLE_MS) return;
      AsyncStorage.getItem(PUSH_TOKEN_KEY)
        .then(async (stored) => {
          if (stored) await this.registerTokenWithBackend(stored);
        })
        .catch(() => {});
    });
  }

  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) return;

      const res = await apiClient.request(
        '/store-owner/notifications/register',
        {
          method: 'POST',
          body: {
            pushToken: token,
            platform: Platform.OS,
            deviceId: Device.modelName,
          },
          headers: { Authorization: `Bearer ${authToken}` },
          // Idempotent upsert on the backend, so replaying it on a timeout
          // is safe — opt back into the retry budget POSTs no longer get by
          // default.
          retries: 2,
        }
      );
      if (res.success) this.lastRegisterAt = Date.now();
    } catch (error) {
      if (__DEV__) console.error('Failed to register token with backend:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  private setupNotificationListeners(): void {
    if (!Notifications) return;
    try {
      this.receivedSub?.remove();
      this.responseSub?.remove();
      this.receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        try {
          if (__DEV__) console.log('Notification received:', notification);
          // A push arriving while the app is open used to do nothing — the
          // order list still waited up to a full poll interval (10–15s) to
          // show the order that just buzzed the phone. Nudge every orders
          // poller to refetch right now.
          const type = notification?.request?.content?.data?.type;
          if (!type || String(type).includes('order')) emitOrdersChanged();
        } catch (error) {
          if (__DEV__) console.warn('Error handling notification:', error);
        }
      });

      this.responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          if (__DEV__) console.log('Notification tapped:', response);
          this.handleNotificationTap(response.notification);
        } catch (error) {
          if (__DEV__) console.warn('Error handling notification tap:', error);
        }
      });

      // The tap that cold-started the app fired before any listener existed
      // (Home mounts, then initialize() runs). Replay it once so a killed
      // app still opens on the incoming order and the popup rings.
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          const id = response?.notification?.request?.identifier;
          if (!response || !id || id === this.lastHandledLaunchTapId) return;
          this.lastHandledLaunchTapId = id;
          this.handleNotificationTap(response.notification);
        })
        .catch(() => {});
    } catch (error) {
      if (__DEV__) console.warn('Failed to setup notification listeners:', error);
    }
  }

  /**
   * Handle notification tap
   */
  private handleNotificationTap(notification: any): void {
    const data = notification.request.content.data;

    // Navigate based on notification type — mirrors notification-inbox.tsx's
    // own openNotification handler for the in-app tap case, so both entry
    // points land in the same place.
    // Developer-tools demo order (lib/devTools): the fake allocation rides
    // in the payload so a tap — even one that cold-starts the app — can
    // raise the same popup without any backend order existing. Ignored in
    // builds without developer tools, so no push can raise a fake order.
    if (typeof data?.demo === 'string' && DEV_TOOLS_AVAILABLE) {
      try {
        emitDemoOrder(JSON.parse(data.demo));
      } catch {
        // malformed demo payload — ignore
      }
      router.push({ pathname: '/(tabs)/previous-orders', params: { tab: 'incoming' } });
      return;
    }

    if (data?.type === 'new_order') {
      // Land on the Incoming segment, and refetch right now so the
      // full-screen Accept/Reject popup (IncomingOrderAlertHost) rings for
      // this order without waiting for the next poll tick.
      emitOrdersChanged();
      router.push({ pathname: '/(tabs)/previous-orders', params: { tab: 'incoming' } });
    }
  }

  /**
   * Send local notification
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  }

  isLocalSchedulingAvailable(): boolean {
    return !!Notifications;
  }

  /**
   * Schedule a local notification `seconds` from now on the orders channel
   * (order chime, max importance). Returns the identifier for cancelling.
   */
  async scheduleLocalNotification(
    title: string,
    body: string,
    data: Record<string, any>,
    seconds: number
  ): Promise<string | null> {
    if (!Notifications) return null;
    return Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: Platform.OS === 'ios' ? 'order_chime.wav' : true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, seconds),
        repeats: false,
        channelId: 'orders_v2',
      },
    });
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get notification preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    await AsyncStorage.setItem(
      NOTIFICATION_PREFERENCES_KEY,
      JSON.stringify(this.preferences)
    );

    // Update backend
    try {
      const authToken = await this.getAuthToken();
      if (authToken) {
        await apiClient.post(
          '/store-owner/notifications/preferences',
          this.preferences,
          { Authorization: `Bearer ${authToken}` }
        );
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to update notification preferences:', error);
    }
  }

  /**
   * Load preferences from storage
   */
  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
      if (stored) {
        this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to load notification preferences:', error);
    }
  }

  /**
   * Clear this device's registered push token from the backend. Call before
   * clearSession() on explicit logout — otherwise the store's expo_push_token
   * stays pointed at this device, and a different shopkeeper logging in on the
   * same (shared) device keeps receiving the previous shopkeeper's order
   * notifications until they happen to re-register (which may never happen if
   * push init only runs once per app session, not per login).
   */
  async unregister(): Promise<void> {
    cancelLockScreenAlerts().catch(() => {});
    stopOrderListener().catch(() => {});
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) return;

      await apiClient.post(
        '/store-owner/notifications/register',
        { pushToken: null },
        { Authorization: `Bearer ${authToken}` }
      );
    } catch (error) {
      if (__DEV__) console.error('Failed to unregister push token:', error);
    }
  }

  /**
   * Get auth token from storage
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const session = await getSession();
      return session?.token ?? null;
    } catch (error) {
      if (__DEV__) console.error('Failed to get auth token:', error);
    }
    return null;
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    if (!Notifications) return false;
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  async getBadgeCount(): Promise<number> {
    if (!Notifications) return 0;
    return await Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    if (!Notifications) return;
    await Notifications.setBadgeCountAsync(count);
  }

  async clearBadge(): Promise<void> {
    if (!Notifications) return;
    await Notifications.setBadgeCountAsync(0);
  }
}

export const notificationService = NotificationService.getInstance();
export default notificationService;
