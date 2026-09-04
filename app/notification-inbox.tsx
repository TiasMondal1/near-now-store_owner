import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';
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

type AppNotification = CachedNotification;

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
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
  // Read fresh on every mount (cheap synchronous in-memory read) — not
  // module-scoped, since a module-level const would only ever capture
  // whatever was cached the very first time this route was imported and
  // never reflect later updates on a subsequent visit within the same
  // session. Seeds the very first render with whatever
  // hydrateNotificationsCache() warmed at splash (app/index.tsx), instead of
  // every visit blocking on getSession() + a network round-trip behind a
  // blank spinner.
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
      const s: any = await getSession();
      if (!s?.token) { router.replace('/landing'); return; }
      setToken(s.token);
      // Cache already showing real content (if any) — this is a background
      // refresh, not the thing the spinner is gating.
      fetchNotifications(s.token, !!cachedNotifications);
    })();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchNotifications(token, true);
    setRefreshing(false);
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
    persistNotifications(next);
    try {
      const res = await apiClient.put('/store-owner/notifications/read-all', undefined, {
        Authorization: `Bearer ${token}`,
      });
      if (!res.success) throw new Error(res.error || 'Mark all read failed');
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark all read failed', error);
      setNotifications(previous);
      persistNotifications(previous);
      Alert.alert("Couldn't mark all as read", 'Please check your connection and try again.');
    }
  }, [token, notifications]);

  const markOneRead = useCallback(async (id: string) => {
    if (!token) return;
    const previous = notifications;
    const next = previous.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    noteNotificationsReadMutation();
    setNotifications(next);
    persistNotifications(next);
    try {
      const res = await apiClient.put(`/store-owner/notifications/${id}/read`, undefined, {
        Authorization: `Bearer ${token}`,
      });
      if (!res.success) throw new Error(res.error || 'Mark one read failed');
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark one read failed', error);
      setNotifications(previous);
      persistNotifications(previous);
      Alert.alert("Couldn't mark as read", 'Please check your connection and try again.');
    }
  }, [token, notifications]);

  const openNotification = useCallback(
    (item: AppNotification) => {
      markOneRead(item.id);
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

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={st.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loadError ? (
            <View style={st.empty}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
              <Text style={st.emptyTitle}>Couldn&apos;t load notifications</Text>
              <Text style={st.emptyText}>Check your connection and try again.</Text>
              <TouchableOpacity
                style={st.retryBtn}
                onPress={() => token && fetchNotifications(token)}
              >
                <Text style={st.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.empty}>
              <Ionicons name="notifications-outline" size={48} color={colors.textTertiary} />
              <Text style={st.emptyTitle}>No notifications yet</Text>
              <Text style={st.emptyText}>New order alerts will appear here</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[st.card, !item.is_read && st.cardUnread]}
            activeOpacity={0.7}
            onPress={() => openNotification(item)}
          >
            <View style={st.iconWrap}>
              <Ionicons name={TYPE_ICON[item.type] ?? 'notifications-outline'} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={st.cardHeaderRow}>
                <Text style={st.cardTitle} numberOfLines={1}>{item.title}</Text>
                {!item.is_read && <View style={st.dot} />}
              </View>
              <Text style={st.cardMessage} numberOfLines={2}>{item.message}</Text>
              <Text style={st.cardTime}>{timeAgo(item.created_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  markAll: { fontSize: 13, fontWeight: '600', color: colors.primary },

  list: { padding: spacing.lg, paddingBottom: 60, gap: spacing.sm },

  card: {
    flexDirection: 'row', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    ...shadows.sm,
  },
  cardUnread: { backgroundColor: colors.surfaceVariant },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  cardMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  cardTime: { fontSize: 11, color: colors.textTertiary, marginTop: 6 },

  empty: { marginTop: 80, alignItems: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.error, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    marginTop: spacing.md, borderRadius: radius.md,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },
});
