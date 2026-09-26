/**
 * Notification preferences panel (rendered by Settings as an overlay).
 * Enables push notifications and toggles the "New orders" alert.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../lib/theme';
import { useLayout, useBottomPadding } from '../lib/useLayout';
import { notificationService, NotificationPreferences } from '../lib/notifications';
import { Button, Card, InlineNotice, ListRow, Screen, Section, Switch, TopBar, useToast } from './ui';

interface Props { onClose?: () => void }

export default function NotificationSettings({ onClose }: Props) {
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(notificationService.getPreferences());
  const [enabled, setEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);
  // Set from getLastRegistrationError() after a failed enable so the status
  // notice can say *why* and offer the fix (device settings).
  const [blocked, setBlocked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Every promise here is caught: getPermissionsAsync / AsyncStorage can
    // reject, and an unhandled rejection in an effect surfaces as a red box
    // in dev and a silent Sentry event in prod. The cancelled flag stops
    // setState after the screen is closed.
    notificationService.areNotificationsEnabled()
      .then((v) => { if (!cancelled) setEnabled(v); })
      .catch(() => {});
    // getPreferences() above can snapshot the hardcoded defaults if this
    // screen mounts before the service's AsyncStorage load (kicked off at
    // import time) has resolved — re-sync once it's actually ready so a
    // previously-saved preference isn't shown/overwritten as "on".
    notificationService.whenReady()
      .then(() => { if (!cancelled) setPrefs(notificationService.getPreferences()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggle = async (key: keyof NotificationPreferences) => {
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await notificationService.updatePreferences(next);
    } catch {
      // Revert the optimistic flip so the switch doesn't show a state that
      // was never saved.
      setPrefs(prev);
      toast.show({ message: "Couldn't save your preference. Please try again.", tone: 'error' });
    }
  };

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      toast.show({ message: "Couldn't open device settings.", tone: 'error' });
    });
  }, [toast]);

  const handleEnable = async () => {
    if (enabling || enabled) return;
    setEnabling(true);
    let token: string | null = null;
    try {
      token = await notificationService.registerForPushNotifications();
    } catch {
      token = null;
    } finally {
      setEnabling(false);
    }
    if (token) {
      setEnabled(true);
      setBlocked(false);
      setUnavailable(false);
      toast.show({ message: 'Notifications enabled', tone: 'success' });
      return;
    }
    const reason = notificationService.getLastRegistrationError();
    if (reason === 'permission-denied') {
      setBlocked(true);
    } else if (reason === 'not-device' || reason === 'expo-go') {
      setUnavailable(true);
    } else {
      toast.show({ message: "Couldn't enable notifications. Please try again.", tone: 'error' });
    }
  };

  const items: { key: keyof NotificationPreferences; title: string; desc: string }[] = [
    { key: 'newOrders', title: 'New orders', desc: 'When you receive a new order' },
  ];

  const statusNotice = enabled ? (
    <InlineNotice
      tone="success"
      title="Notifications are on"
      message="You'll receive push alerts for new orders. To turn them off, use your device's notification settings."
      action={{ label: 'Open settings', onPress: openSettings }}
    />
  ) : unavailable ? (
    <InlineNotice
      tone="info"
      title="Notifications aren't available"
      message="This device can't receive push notifications, so order alerts will only appear inside the app."
    />
  ) : blocked ? (
    <InlineNotice
      tone="warning"
      title="Notifications are blocked"
      message="Allow notifications for Near & Now in your device settings to receive order alerts."
      action={{ label: 'Open settings', onPress: openSettings }}
    />
  ) : (
    <InlineNotice
      tone="warning"
      title="Notifications are off"
      message="Enable them to receive important order alerts."
    />
  );

  return (
    <Screen>
      {/* Dismisses like every other stack header — left back button, "Go back". */}
      <TopBar title="Notification preferences" onBack={onClose} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {statusNotice}

          {!enabled && !unavailable ? (
            <Button
              label="Enable notifications"
              leftIcon="notifications-outline"
              fullWidth
              loading={enabling}
              onPress={handleEnable}
            />
          ) : null}

          <Section title="Notification types">
            <Card padded={false}>
              {items.map((item, idx) => (
                <ListRow
                  key={item.key}
                  title={item.title}
                  description={item.desc}
                  showSeparator={idx < items.length - 1}
                  trailing={
                    <Switch
                      accessibilityLabel={item.title}
                      value={prefs[item.key]}
                      onValueChange={() => void toggle(item.key)}
                      disabled={!enabled}
                    />
                  }
                />
              ))}
            </Card>
            <Text style={styles.hint}>
              {enabled
                ? 'We recommend keeping new-order alerts on.'
                : 'Turn on notifications above to change these settings.'}
            </Text>
          </Section>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: 'center' },
  column: { gap: spacing.xl },
  hint: { ...typography.caption, color: colors.textMuted },
});
