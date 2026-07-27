/**
 * Settings screen
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';
import { getSession, clearSession } from '../session';
import { notificationService } from '../lib/notifications';
import { CachedStore, fetchStoresCached, peekStores } from '../lib/appCache';
import NotificationSettings from '../components/NotificationSettings';
import { useRequireStoreApproval } from '../lib/useRequireStoreApproval';

type SettingItem = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  onPress: () => void;
};

export default function SettingsScreen() {
  useRequireStoreApproval();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<CachedStore | null>(peekStores()?.[0] ?? null);
  const [session, setSession] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      ]).start();
    }
  }, [loading]);

  const loadData = async () => {
    try {
      const s: any = await getSession();
      if (!s?.token) { router.replace('/landing'); return; }
      setSession(s);
      // Session is all this screen needs to render (name/phone come from it,
      // and the store is only used for the "Store ID" info row) — render
      // immediately instead of blocking on a store fetch, then backfill the
      // store in the background via the shared cache used by the other tabs
      // (was previously a redundant uncached fetch on every visit here).
      setLoading(false);

      const cached = peekStores();
      if (cached?.[0]) setStore(cached[0]);
      const fresh = await fetchStoresCached(s.token, s.user?.id);
      if (fresh?.[0]) setStore(fresh[0]);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await notificationService.unregister(); await clearSession(); router.replace('/landing'); } },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const ownerName = session?.user?.name || 'Shopkeeper';
  const ownerPhone = session?.user?.phone || '';
  const prefItems: SettingItem[] = [
    { key: 'notif-inbox', icon: 'notifications-outline', iconBg: colors.background, iconColor: colors.textSecondary, title: 'Notifications', desc: 'View order alerts and updates', onPress: () => router.push('/notification-inbox') },
    { key: 'notif', icon: 'options-outline', iconBg: colors.background, iconColor: colors.textSecondary, title: 'Notification Preferences', desc: 'Manage alerts and sounds', onPress: () => setShowNotifications(true) },
  ];

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Header */}
          <View style={st.header}>
            <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Settings</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Profile card */}
          <TouchableOpacity style={st.profileCard} onPress={() => router.push('/profile')} activeOpacity={0.7}>
            <View style={st.profileAvatar}>
              <Text style={st.profileAvatarText}>{ownerName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.profileName}>{ownerName}</Text>
              {ownerPhone ? <Text style={st.profilePhone}>{ownerPhone}</Text> : null}
              <Text style={st.profileLink}>View profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Preferences section */}
          <Text style={st.sectionLabel}>Preferences</Text>
          <View style={st.cardGroup}>
            {prefItems.map((item, idx) => (
              <React.Fragment key={item.key}>
                <TouchableOpacity style={st.row} onPress={item.onPress} activeOpacity={0.6}>
                  <View style={[st.rowIcon, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={20} color={item.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowTitle}>{item.title}</Text>
                    <Text style={st.rowDesc}>{item.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
                {idx < prefItems.length - 1 && <View style={st.rowDivider} />}
              </React.Fragment>
            ))}
          </View>

          {/* About section */}
          <Text style={st.sectionLabel}>About</Text>
          <View style={st.cardGroup}>
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>App Version</Text>
              <View style={st.infoBadge}><Text style={st.infoBadgeText}>1.0.0</Text></View>
            </View>
            <View style={st.rowDivider} />
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>Store ID</Text>
              <Text style={st.infoValue} numberOfLines={1}>{store?.id ? store.id.slice(0, 12) + '...' : 'N/A'}</Text>
            </View>
          </View>

          {/* Help & Support */}
          <Text style={st.sectionLabel}>Support</Text>
          <View style={st.cardGroup}>
            <TouchableOpacity style={st.row} onPress={() => router.push('/help')} activeOpacity={0.6}>
              <View style={[st.rowIcon, { backgroundColor: colors.background }]}>
                <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowTitle}>Help & Support</Text>
                <Text style={st.rowDesc}>FAQs, contact us, report issues</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <TouchableOpacity style={st.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={st.logoutText}>Log out</Text>
          </TouchableOpacity>

          <Text style={st.footer}>Near & Now · Store Owner v1.0</Text>

        </Animated.View>
      </ScrollView>

      {showNotifications && (
        <View style={st.notifOverlay}>
          <NotificationSettings onClose={() => setShowNotifications(false)} />
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

  // Profile card
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary + '20',
  },
  profileAvatarText: { fontSize: 20, fontWeight: '700', color: colors.primary },
  profileName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  profilePhone: { fontSize: 13, color: colors.textTertiary, marginTop: 1 },
  profileLink: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 3 },

  // Section label
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: spacing.sm, marginLeft: spacing.xs },

  // Card group — multiple rows inside one card
  cardGroup: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xl, overflow: 'hidden',
    ...shadows.sm,
  },

  // Row inside card group
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: colors.borderLight, marginLeft: 40 + spacing.lg + spacing.md },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 13, color: colors.textTertiary, fontWeight: '500', maxWidth: 160 },
  infoBadge: {
    backgroundColor: colors.primaryBg, borderRadius: radius.xs,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  infoBadgeText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 14,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.error + '25', backgroundColor: colors.error + '06',
    marginBottom: spacing.lg,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.error },

  // Footer
  footer: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.lg },

  // Notification overlay
  notifOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.background,
  },
});
