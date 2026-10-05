/**
 * Settings — the account hub: profile card, notifications, store links,
 * support, about, and logout.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { spacing } from '../lib/theme';
import { useLayout, useBottomPadding } from '../lib/useLayout';
import { clearSession } from '../session';
import { notificationService } from '../lib/notifications';
import { useSelectedStore } from '../lib/useSelectedStore';
import { peekNotifications } from '../lib/notificationsCache';
import NotificationSettings from '../components/NotificationSettings';
import { useRequireStoreApproval } from '../lib/useRequireStoreApproval';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  InlineNotice,
  KeyValueRow,
  ListRow,
  Screen,
  Section,
  Skeleton,
  TopBar,
} from '../components/ui';
import { InitialAvatar } from '../components/profile';
import { DEV_TOOLS_AVAILABLE, isDevToolsEnabled, onDevToolsEnabledChange, setDevToolsEnabled } from '../lib/devTools';

const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  useRequireStoreApproval();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  // Session (name/phone) and the selected store (the "Store ID" row) come
  // from the shared resolution hook; the hook redirects to /landing itself
  // when there is no session.
  const { session, store, loading, retry } = useSelectedStore();
  // No store resolved once the bootstrap settled — shown as a warning notice
  // above the hub with Retry; the rest of the screen still renders.
  const loadError = !loading && !store;
  const [showNotifications, setShowNotifications] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // TEMPORARY developer tools (lib/devTools). Never true in production builds.
  const [devTools, setDevTools] = useState(false);
  const versionTaps = useRef(0);
  useEffect(() => {
    if (!DEV_TOOLS_AVAILABLE) return;
    void isDevToolsEnabled().then(setDevTools);
    return onDevToolsEnabledChange(setDevTools);
  }, []);
  // Hidden tools come back with 7 taps on the Version row (dev/preview only).
  const onVersionTap = useCallback(() => {
    if (!DEV_TOOLS_AVAILABLE || devTools) return;
    versionTaps.current += 1;
    if (versionTaps.current >= 7) {
      versionTaps.current = 0;
      void setDevToolsEnabled(true);
    }
  }, [devTools]);
  // Unread count from the inbox cache warmed at splash / by Home's badge poll —
  // a cheap synchronous read, shown on the Inbox row when available.
  const readUnreadCount = () => (peekNotifications() ?? []).filter((n) => !n.is_read).length;
  const [unreadCount, setUnreadCount] = useState(readUnreadCount);
  // Re-read on every focus so marking the inbox read and coming back here
  // (Settings stays mounted underneath) clears the badge.
  useFocusEffect(useCallback(() => { setUnreadCount(readUnreadCount()); }, []));

  // The preferences panel is an overlay, not a route — make the Android back
  // button close it instead of popping the whole Settings screen.
  useEffect(() => {
    if (Platform.OS !== 'android' || !showNotifications) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowNotifications(false);
      return true;
    });
    return () => sub.remove();
  }, [showNotifications]);

  const performLogout = useCallback(async () => {
    await notificationService.unregister();
    await clearSession();
    router.replace('/landing');
  }, []);

  const ownerName = session?.user?.name || 'Shopkeeper';
  const ownerPhone = session?.user?.phone || '';

  return (
    <Screen>
      <TopBar title="Settings" backHref="/(tabs)/home" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {loading ? (
            <>
              <Card padded={false}><Skeleton.ListRow count={1} /></Card>
              <Card padded={false}><Skeleton.ListRow count={2} /></Card>
              <Card padded={false}><Skeleton.ListRow count={3} /></Card>
            </>
          ) : (
            <>
              {loadError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't load store details"
                  message="Check your connection and try again."
                  action={{ label: 'Retry', onPress: retry }}
                />
              ) : null}

              {/* Profile card */}
              <Card padded={false}>
                <ListRow
                  leading={<InitialAvatar name={ownerName} />}
                  title={ownerName}
                  description={ownerPhone || 'View profile'}
                  chevron
                  onPress={() => router.push('/profile')}
                  accessibilityLabel={`${ownerName}${ownerPhone ? `, ${ownerPhone}` : ''}`}
                  accessibilityHint="Opens your profile"
                />
              </Card>

              <Section title="Notifications">
                <Card padded={false}>
                  <ListRow
                    icon="notifications-outline"
                    iconTile
                    title="Inbox"
                    description="Order alerts and updates"
                    trailing={unreadCount > 0 ? <Badge label={`${unreadCount} new`} tone="error" /> : undefined}
                    chevron
                    showSeparator
                    onPress={() => router.push('/notification-inbox')}
                    accessibilityLabel={unreadCount > 0 ? `Inbox, ${unreadCount} new` : 'Inbox'}
                  />
                  <ListRow
                    icon="options-outline"
                    iconTile
                    title="Preferences"
                    description="Choose which order alerts you receive"
                    chevron
                    showSeparator
                    onPress={() => setShowNotifications(true)}
                  />
                  <ListRow
                    icon="shield-checkmark-outline"
                    iconTile
                    title="Order alert setup"
                    description="Lock-screen, alarm and battery settings"
                    chevron
                    onPress={() => router.push('/alert-setup')}
                  />
                </Card>
              </Section>

              <Section title="Store">
                <Card padded={false}>
                  <ListRow
                    icon="cube-outline"
                    iconTile
                    title="My submissions"
                    description="Track custom product review status"
                    chevron
                    showSeparator
                    onPress={() => router.push('/product-submissions')}
                  />
                  <ListRow
                    icon="card-outline"
                    iconTile
                    title="Billing details"
                    description="Update bank account and IFSC"
                    chevron
                    showSeparator
                    onPress={() => router.push('/billing-info')}
                  />
                  <ListRow
                    icon="shield-checkmark-outline"
                    iconTile
                    title="Verification documents"
                    description="Aadhaar, PAN, licences and store photos"
                    chevron
                    showSeparator
                    onPress={() => router.push('/upload-documents')}
                  />
                  {/* Multi-store ownership (2026-10-02). Switching between
                      stores is the store name at the top of Home. */}
                  <ListRow
                    icon="add-circle-outline"
                    iconTile
                    title="Add another store"
                    description="Run more than one shop from this account"
                    chevron
                    onPress={() => router.push('/add-store')}
                    testID="settings-add-store"
                  />
                </Card>
              </Section>

              <Section title="Support">
                <Card padded={false}>
                  <ListRow
                    icon="help-circle-outline"
                    iconTile
                    title="Help & support"
                    description="FAQs, contact us, report issues"
                    chevron
                    onPress={() => router.push('/help')}
                  />
                </Card>
              </Section>

              <Section title="About">
                <Card>
                  <KeyValueRow label="Store ID" value={store?.id ?? 'Unavailable'} showSeparator />
                  <Pressable onPress={onVersionTap} accessible={false}>
                    <KeyValueRow label="Version" value={APP_VERSION} />
                  </Pressable>
                </Card>
              </Section>

              {DEV_TOOLS_AVAILABLE && devTools ? (
                <Section title="Developer tools">
                  <Card padded={false}>
                    <ListRow
                      icon="construct-outline"
                      iconTile
                      title="Developer tools"
                      description="Simulate an incoming order · demo login"
                      chevron
                      onPress={() => router.push('/dev-tools')}
                    />
                  </Card>
                </Section>
              ) : null}

              <Button
                label="Log out"
                variant="destructive"
                fullWidth
                leftIcon="log-out-outline"
                onPress={() => setConfirmingLogout(true)}
              />
            </>
          )}
        </View>
      </ScrollView>

      {showNotifications ? (
        <View style={StyleSheet.absoluteFill}>
          <NotificationSettings onClose={() => setShowNotifications(false)} />
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        destructive
        icon="log-out-outline"
        title="Log out?"
        message="You'll need to verify your phone again to sign back in."
        confirmLabel="Log out"
        onConfirm={performLogout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: 'center' },
  column: { gap: spacing.xl },
});
