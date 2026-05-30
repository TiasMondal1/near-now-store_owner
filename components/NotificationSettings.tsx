import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadows } from '../lib/theme';
import { notificationService, NotificationPreferences } from '../lib/notifications';

interface Props { onClose?: () => void }

export default function NotificationSettings({ onClose }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(notificationService.getPreferences());
  const [enabled, setEnabled] = useState(false);

  useEffect(() => { notificationService.areNotificationsEnabled().then(setEnabled); }, []);

  const toggle = async (key: keyof NotificationPreferences) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await notificationService.updatePreferences(next);
  };

  const handleEnable = async () => {
    if (!enabled) {
      const token = await notificationService.registerForPushNotifications();
      if (token) { setEnabled(true); Alert.alert('Success', 'Notifications enabled'); }
    } else {
      Alert.alert('Disable Notifications', 'Go to your device settings to disable notifications.');
    }
  };

  const items: { key: keyof NotificationPreferences; title: string; desc: string }[] = [
    { key: 'newOrders', title: 'New Orders', desc: 'When you receive a new order' },
    { key: 'lowStock', title: 'Low Stock Alerts', desc: 'When products are running low' },
    { key: 'dailySummary', title: 'Daily Summary', desc: 'Daily sales and order recap' },
    { key: 'payments', title: 'Payment Updates', desc: 'Payment confirmations' },
    { key: 'systemAlerts', title: 'System Alerts', desc: 'Important announcements' },
  ];

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={st.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={st.title}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll}>
        {/* Status */}
        <View style={st.card}>
          <View style={st.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.statusTitle}>{enabled ? 'Notifications are on' : 'Notifications are off'}</Text>
              <Text style={st.statusDesc}>{enabled ? 'You will receive push notifications' : 'Enable to receive important alerts'}</Text>
            </View>
            {!enabled ? (
              <TouchableOpacity style={st.enableBtn} onPress={handleEnable}>
                <Text style={st.enableBtnText}>Enable</Text>
              </TouchableOpacity>
            ) : (
              <View style={st.onBadge}><Text style={st.onBadgeText}>On</Text></View>
            )}
          </View>
        </View>

        {/* Notification types */}
        <Text style={st.sectionLabel}>Notification types</Text>
        <View style={st.card}>
          {items.map((item, idx) => (
            <React.Fragment key={item.key}>
              <View style={st.row}>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowTitle}>{item.title}</Text>
                  <Text style={st.rowDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={() => toggle(item.key)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                  disabled={!enabled}
                />
              </View>
              {idx < items.length - 1 && <View style={st.divider} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={st.hint}>
          Critical notifications like new orders are highly recommended to stay enabled.
        </Text>
      </ScrollView>
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
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: spacing.sm, marginLeft: spacing.xs, marginTop: spacing.lg },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  statusTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  statusDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  enableBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  enableBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  onBadge: { backgroundColor: colors.primaryBg, borderRadius: radius.xs, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  onBadgeText: { color: colors.primary, fontSize: 12, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  rowDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: spacing.lg },

  hint: { fontSize: 12, color: colors.textTertiary, lineHeight: 18, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
});
