import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';
import { getSession } from '../session';
import { config } from '../lib/config';
import { useRequireStoreApproval } from '../lib/useRequireStoreApproval';
import {
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

  const fetchNotifications = useCallback(async (authToken: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`${config.API_BASE}/store-owner/notifications`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      const list: AppNotification[] = Array.isArray(data) ? data : [];
      setNotifications(list);
      await persistNotifications(list);
    } catch {
      // Non-fatal when we already have cached data showing — only clobber
      // to empty on a genuinely cold, cache-less first load.
      if (!cachedNotifications) setNotifications([]);
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
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true }));
      persistNotifications(next);
      return next;
    });
    try {
      await fetch(`${config.API_BASE}/store-owner/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark all read failed', error);
    }
  }, [token]);

  const markOneRead = useCallback(async (id: string) => {
    if (!token) return;
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      persistNotifications(next);
      return next;
    });
    try {
      await fetch(`${config.API_BASE}/store-owner/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      if (__DEV__) console.warn('[notification-inbox] Mark one read failed', error);
    }
  }, [token]);

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
          <View style={st.empty}>
            <Ionicons name="notifications-outline" size={48} color={colors.textTertiary} />
            <Text style={st.emptyTitle}>No notifications yet</Text>
            <Text style={st.emptyText}>New order alerts will appear here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[st.card, !item.is_read && st.cardUnread]}
            activeOpacity={0.7}
            onPress={() => markOneRead(item.id)}
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
});
