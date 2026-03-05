/**
 * Notification settings component
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { notificationService, NotificationPreferences } from '../lib/notifications';

interface NotificationSettingsProps {
  onClose?: () => void;
}

export default function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    notificationService.getPreferences()
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    const enabled = await notificationService.areNotificationsEnabled();
    setNotificationsEnabled(enabled);
  };

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const newPreferences = { ...preferences, [key]: !preferences[key] };
    setPreferences(newPreferences);
    await notificationService.updatePreferences(newPreferences);
  };

  const handleEnableNotifications = async () => {
    if (!notificationsEnabled) {
      const token = await notificationService.registerForPushNotifications();
      if (token) {
        setNotificationsEnabled(true);
        Alert.alert('Success', 'Notifications enabled successfully');
      }
    } else {
      Alert.alert(
        'Disable Notifications',
        'To disable notifications, please go to your device settings.',
        [{ text: 'OK' }]
      );
    }
  };

  const settingsItems = [
    {
      key: 'newOrders' as keyof NotificationPreferences,
      title: 'New Orders',
      description: 'Get notified when you receive a new order',
      icon: 'cart' as const,
    },
    {
      key: 'lowStock' as keyof NotificationPreferences,
      title: 'Low Stock Alerts',
      description: 'Get notified when products are running low',
      icon: 'alert-circle' as const,
    },
    {
      key: 'dailySummary' as keyof NotificationPreferences,
      title: 'Daily Summary',
      description: 'Receive daily sales and order summary',
      icon: 'calendar' as const,
    },
    {
      key: 'payments' as keyof NotificationPreferences,
      title: 'Payment Updates',
      description: 'Get notified about payment confirmations',
      icon: 'cash' as const,
    },
    {
      key: 'systemAlerts' as keyof NotificationPreferences,
      title: 'System Alerts',
      description: 'Important updates and announcements',
      icon: 'notifications' as const,
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notification Settings</Text>
          <Text style={styles.subtitle}>Manage your notification preferences</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.statusCard}>
          <View style={styles.statusInfo}>
            <Ionicons
              name={notificationsEnabled ? 'checkmark-circle' : 'close-circle'}
              size={32}
              color={notificationsEnabled ? colors.success : colors.error}
            />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>
                {notificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled'}
              </Text>
              <Text style={styles.statusDescription}>
                {notificationsEnabled
                  ? 'You will receive push notifications'
                  : 'Enable to receive important alerts'}
              </Text>
            </View>
          </View>
          {!notificationsEnabled && (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={handleEnableNotifications}
            >
              <Text style={styles.enableButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Types</Text>
        {settingsItems.map((item) => (
          <View key={item.key} style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: preferences[item.key] ? colors.primary : colors.border },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={preferences[item.key] ? colors.surface : colors.textSecondary}
                />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{item.title}</Text>
                <Text style={styles.settingDescription}>{item.description}</Text>
              </View>
            </View>
            <Switch
              value={preferences[item.key]}
              onValueChange={() => handleToggle(item.key)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
              disabled={!notificationsEnabled}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.infoText}>
          <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
          {' '}You can change these settings anytime. Critical notifications like new orders
          are highly recommended to stay enabled.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  enableButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  enableButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
