/**
 * Push notification service for store owner app
 * Handles registration, permissions, and notification display
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api-client';

const PUSH_TOKEN_KEY = 'push_notification_token';
const NOTIFICATION_PREFERENCES_KEY = 'notification_preferences';

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

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    try {
      // Check permissions
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

      // Get push token - don't require projectId for Expo Go
      let token;
      try {
        // Try without projectId first (works in Expo Go)
        token = await Notifications.getExpoPushTokenAsync();
      } catch (error: any) {
        // If that fails, log but don't crash
        console.warn('Could not get push token:', error?.message || error);
        return null;
      }

      if (!token?.data) {
        console.warn('No push token received');
        return null;
      }

      this.pushToken = token.data;
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);

      // Send token to backend (non-blocking)
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
    try {
      // Handle notification received while app is in foreground
      Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
        try {
          console.log('Notification received:', notification);
        } catch (error) {
          console.warn('Error handling notification:', error);
        }
      });

      // Handle notification tapped
      Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
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
  private handleNotificationTap(notification: Notifications.Notification): void {
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Show immediately
    });
  }

  /**
   * Schedule notification (simplified - sends immediately for now)
   * TODO: Fix trigger type when expo-notifications types are updated
   */
  async scheduleNotification(
    title: string,
    body: string,
    triggerDate: Date,
    data?: Record<string, any>
  ): Promise<string> {
    // Simplified: send immediately instead of scheduling
    // The expo-notifications types have strict requirements that need proper configuration
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // null = immediate
    });
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
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
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Get badge count
   */
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  /**
   * Set badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  /**
   * Clear badge
   */
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

export const notificationService = NotificationService.getInstance();
export default notificationService;
