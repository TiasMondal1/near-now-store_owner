/**
 * Push notification service for store owner app
 * Handles registration, permissions, and notification display
 */

import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { apiClient } from './api-client';

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
    console.warn('[notifications] expo-notifications unavailable:', e);
    Notifications = null;
  }
}

export interface NotificationPreferences {
  newOrders: boolean;
  lowStock: boolean;
  dailySummary: boolean;
  payments: boolean;
  systemAlerts: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  newOrders: true,
  lowStock: true,
  dailySummary: true,
  payments: true,
  systemAlerts: true,
};

class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;

  private constructor() {
    this.loadPreferences();
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
        console.log('[notifications] Skipping push setup: running in Expo Go');
        return;
      }

      // Only register on physical devices
      if (Device.isDevice) {
        await this.registerForPushNotifications();
        this.setupNotificationListeners();
      } else {
        console.log('Notifications disabled: Not a physical device');
      }
    } catch (error) {
      console.warn('Failed to initialize notifications:', error);
      // Don't throw - app should work without notifications
    }
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (IS_EXPO_GO || !Notifications) {
      console.log('[notifications] Push registration skipped: Expo Go or module unavailable');
      return null;
    }

    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted');
        return null;
      }

      let token;
      try {
        token = await Notifications.getExpoPushTokenAsync();
      } catch (error: any) {
        console.warn('Could not get push token:', error?.message || error);
        return null;
      }

      if (!token?.data) {
        console.warn('No push token received');
        return null;
      }

      this.pushToken = token.data;
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);

      this.registerTokenWithBackend(token.data).catch((err) => {
        console.warn('Failed to register token with backend:', err);
      });

      console.log('✅ Push notification token registered');
      return token.data;
    } catch (error: any) {
      console.warn('Push notification registration failed:', error?.message || error);
      return null;
    }
  }

  /**
   * Register token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) return;

      await apiClient.post(
        '/store-owner/notifications/register',
        {
          pushToken: token,
          platform: Platform.OS,
          deviceId: Device.modelName,
        },
        { Authorization: `Bearer ${authToken}` }
      );
    } catch (error) {
      console.error('Failed to register token with backend:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  private setupNotificationListeners(): void {
    if (!Notifications) return;
    try {
      Notifications.addNotificationReceivedListener((notification) => {
        try {
          console.log('Notification received:', notification);
        } catch (error) {
          console.warn('Error handling notification:', error);
        }
      });

      Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          console.log('Notification tapped:', response);
          this.handleNotificationTap(response.notification);
        } catch (error) {
          console.warn('Error handling notification tap:', error);
        }
      });
    } catch (error) {
      console.warn('Failed to setup notification listeners:', error);
    }
  }

  /**
   * Handle notification tap
   */
  private handleNotificationTap(notification: any): void {
    const data = notification.request.content.data;

    // Navigate based on notification type
    if (data?.type === 'new_order') {
      // Navigate to orders screen
      console.log('Navigate to order:', data.orderId);
    } else if (data?.type === 'low_stock') {
      // Navigate to inventory
      console.log('Navigate to inventory');
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

  /**
   * Schedule notification (simplified - sends immediately for now)
   * TODO: Fix trigger type when expo-notifications types are updated
   */
  async scheduleNotification(
    title: string,
    body: string,
    _triggerDate: Date,
    data?: Record<string, any>
  ): Promise<string> {
    if (!Notifications) return '';
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
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
      console.error('Failed to update notification preferences:', error);
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
      console.error('Failed to load notification preferences:', error);
    }
  }

  /**
   * Get auth token from storage
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const session = await AsyncStorage.getItem('session');
      if (session) {
        const parsed = JSON.parse(session);
        return parsed.token || null;
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
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
