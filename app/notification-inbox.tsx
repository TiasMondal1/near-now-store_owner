import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '../lib/theme';
import { useLayout, useBottomPadding } from '../lib/useLayout';
import { getSession } from '../session';
import { apiClient } from '../lib/api-client';
import { useRequireStoreApproval } from '../lib/useRequireStoreApproval';
import {
  lastNotificationsReadMutationTs,
  noteNotificationsReadMutation,
  peekNotifications,
  persistNotifications,
  type CachedNotification,
} from '../lib/notificationsCache';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  Screen,
  Skeleton,
  TopBar,
  useToast,
  type IoniconName,
} from '../components/ui';
import { GroupedRow, NotificationRow } from '../components/profile';

type AppNotification = CachedNotification;

const TYPE_ICON: Record<string, IoniconName> = {
  new_order: 'bag-check-outline',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationInboxScreen() {
  useRequireStoreApproval();
  const { contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();
  // Read fresh on every mount (cheap synchronous in-memory read) — not
  // module-scoped, since a module-level const would only ever capture
  // whatever was cached the very first time this route was imported and
  // never reflect later updates on a subsequent visit within the same
  // session. Seeds the very first render with whatever
  // hydrateNotificationsCache() warmed at splash (app/index.tsx), instead of
  // every visit blocking on getSession() + a network round-trip behind a
  // blank skeleton.
  const [cachedNotifications] = useState(() => peekNotifications());
  const [token, setToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>(cachedNotifications ?? []);
  const [loading, setLoading] = useState(!cachedNotifications);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // A list fetch that was already in flight when the user tapped "mark
  // read"/"mark all read" carries pre-mutation is_read flags — committing
  // (and persisting) it would visibly flip the rows back to unread until the
  // server round trip settled. The stamp lives in notificationsCache so
  // Home's badge poll (a second writer to the same cache) honors it too.
  const fetchNotifications = useCallback(async (authToken: string, silent = false) => {
    const requestStartedAt = Date.now();
    try {
      if (!silent) setLoading(true);
      const res = await apiClient.get<AppNotification[]>('/store-owner/notifications', {
        Authorization: `Bearer ${authToken}`,
      });
      if (!res.success) throw new Error(res.error || `Notifications fetch failed`);
      if (!Array.isArray(res.data)) throw new Error('Notifications fetch returned an unexpected shape');
      if (lastNotificationsReadMutationTs() > requestStartedAt) return;
      setNotifications(res.data);
      setLoadError(false);
      await persistNotifications(res.data);
    } catch {
      // Non-fatal when data is already showing (cache-seeded or from a prior
      // fetch) — never wipe a visible list over a refresh failure. The flag
      // still lets a genuinely empty inbox tell "nothing to show" apart from
      // "couldn't load" and offer a retry.
      setNotifications((prev) => (prev.length > 0 ? prev : []));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const s = await getSession();
      if (!s?.token) { router.replace('/landing'); return; }
      setToken(s.token);
      // Cache already showing real content (if any) — this is a background
      // refresh, not the thing the skeleton is gating.
      void fetchNotifications(s.token, !!cachedNotifications);
    })();
  }, [fetchNotifications, cachedNotifications]);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchNotifications(token, true);
    setRefreshing(false);
  }, [token, fetchNotifications]);

  const retry = useCallback(() => {
    if (token) void fetchNotifications(token);
  }, [token, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    if (!token) return;
    // Snapshot before the optimistic update so a failed PUT can be reverted
    // instead of leaving this screen permanently out of sync with the real
    // server state (e.g. Home's bell badge, which always refetches fresh).
    const previous = notifications;
    const next = previous.map((n) => ({ ...n, is_read: true }));
    noteNotificationsReadMutation();
    setNotifications(next);
    void persistNotifications(next);
    try {
      const res = await apiClient.put('/store-owner/notifications/read-all', undefined, {
        Authorization: `Bearer ${token}`,
      });
      if (!res.success) throw new Error(res.error || 'Mark all read failed');
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark all read failed', error);
      setNotifications(previous);
      void persistNotifications(previous);
      toast.show({ message: "Couldn't mark all as read. Check your connection and try again.", tone: 'error' });
    }
  }, [token, notifications, toast]);

  const markOneRead = useCallback(async (id: string) => {
    if (!token) return;
    const previous = notifications;
    const next = previous.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    noteNotificationsReadMutation();
    setNotifications(next);
    void persistNotifications(next);
    try {
      const res = await apiClient.put(`/store-owner/notifications/${id}/read`, undefined, {
        Authorization: `Bearer ${token}`,
      });
      if (!res.success) throw new Error(res.error || 'Mark one read failed');
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark one read failed', error);
      setNotifications(previous);
      void persistNotifications(previous);
      toast.show({ message: "Couldn't mark as read. Check your connection and try again.", tone: 'error' });
    }
  }, [token, notifications, toast]);

  const openNotification = useCallback(
    (item: AppNotification) => {
      void markOneRead(item.id);
      // No single-order detail screen exists in this app — orders live only
      // as rows within the Orders tab's incoming/active/previous lists — so
      // the deep link is "go to the tab that actually shows it" rather than
      // a specific order screen. `new_order` always starts in the Incoming
      // tab, which is that tab's own default state.
      if (item.type === 'new_order') {
        router.push('/(tabs)/previous-orders');
      }
    },
    [markOneRead]
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const hasContent = notifications.length > 0;
  const showSkeleton = loading && !hasContent;
  const showError = !loading && loadError && !hasContent;

  const renderItem = useCallback(
    ({ item, index }: { item: AppNotification; index: number }) => (
      <GroupedRow first={index === 0} last={index === notifications.length - 1}>
        <NotificationRow
          icon={TYPE_ICON[item.type] ?? 'notifications-outline'}
          title={item.title}
          message={item.message}
          time={timeAgo(item.created_at)}
          unread={!item.is_read}
          showSeparator={index < notifications.length - 1}
          onPress={() => openNotification(item)}
        />
      </GroupedRow>
    ),
    [notifications.length, openNotification]
  );

  return (
    <Screen>
      <TopBar
        title="Inbox"
        backHref="/(tabs)/home"
        right={
          <Button
            label="Mark all read"
            variant="text"
            size="sm"
            onPress={markAllRead}
            disabled={unreadCount === 0 || !token}
            accessibilityLabel="Mark all notifications as read"
          />
        }
      />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            enabled={!!token}
          />
        }
        ListHeaderComponent={
          loadError && hasContent ? (
            <View style={styles.header}>
              <InlineNotice
                tone="warning"
                title="Couldn't refresh"
                message="Showing saved data"
                action={{ label: 'Retry', onPress: retry }}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          showSkeleton ? (
            <Card padded={false}>
              <Skeleton.ListRow count={6} />
            </Card>
          ) : showError ? (
            <ErrorState
              icon="cloud-offline-outline"
              title="Couldn't load notifications"
              message="Check your connection and try again."
              action={{ onPress: retry, loading }}
            />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title="You're all caught up"
              message="New order alerts will appear here."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, alignSelf: 'center', paddingTop: spacing.lg },
  header: { paddingBottom: spacing.lg },
});
