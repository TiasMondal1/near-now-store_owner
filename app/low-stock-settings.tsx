import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';
import { getSession } from '../session';
import { config } from '../lib/config';
import { fetchStoresCached, peekStores, clearStoreCache } from '../lib/appCache';

const PRESETS = [3, 5, 10, 15, 20] as const;

export default function LowStockSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState('5');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) { router.replace('/landing'); return; }
      setToken(s.token);
      const cached = peekStores();
      const store = cached?.[0] || (await fetchStoresCached(s.token, s.user?.id))?.[0];
      setStoreId(store?.id || null);
      const sd = store as any;
      if (sd?.low_stock_threshold != null) setThreshold(String(sd.low_stock_threshold));
      if (sd?.low_stock_alert != null) setAlertEnabled(sd.low_stock_alert);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    const val = parseInt(threshold, 10);
    if (!Number.isFinite(val) || val < 0) { Alert.alert('Invalid', 'Enter a valid number'); return; }
    if (!token || !storeId) return;
    setSaving(true);
    try {
      await fetch(`${config.API_BASE}/store-owner/stores/${storeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ low_stock_threshold: val, low_stock_alert: alertEnabled }),
      });
      clearStoreCache();
      Alert.alert('Saved', 'Low stock settings updated');
    } catch { Alert.alert('Error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View></SafeAreaView>;
  }

  const currentVal = parseInt(threshold, 10) || 0;

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.title}>Low Stock Alerts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Enable/disable */}
        <View style={st.card}>
          <View style={st.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.toggleTitle}>Low stock alerts</Text>
              <Text style={st.toggleDesc}>Get notified when a product's stock falls below the threshold</Text>
            </View>
            <Switch
              value={alertEnabled}
              onValueChange={setAlertEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Threshold input */}
        <Text style={st.sectionLabel}>Threshold quantity</Text>
        <View style={st.card}>
          <View style={st.inputRow}>
            <Text style={st.inputLabel}>Alert when stock falls below</Text>
            <View style={st.inputWrap}>
              <TextInput
                style={st.input}
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="number-pad"
                maxLength={4}
                selectTextOnFocus
              />
              <Text style={st.inputUnit}>units</Text>
            </View>
          </View>
        </View>

        {/* Quick presets */}
        <Text style={st.sectionLabel}>Quick set</Text>
        <View style={st.presetsRow}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[st.preset, currentVal === p && st.presetActive]}
              onPress={() => setThreshold(String(p))}
              activeOpacity={0.7}
            >
              <Text style={[st.presetText, currentVal === p && st.presetTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <View style={st.infoCard}>
          <Text style={st.infoText}>
            When any product in your store has fewer than {currentVal || '—'} units remaining, you'll receive an alert so you can restock in time.
          </Text>
        </View>

        <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.saveBtnText}>Save Settings</Text>}
        </TouchableOpacity>
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

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  toggleDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2, lineHeight: 17 },

  inputRow: { padding: spacing.lg, gap: spacing.md },
  inputLabel: { fontSize: 14, color: colors.textSecondary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 20, fontWeight: '700', color: colors.textPrimary,
    minWidth: 70, textAlign: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  inputUnit: { fontSize: 14, color: colors.textTertiary },

  presetsRow: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1, paddingVertical: 12, borderRadius: radius.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  presetActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  presetTextActive: { color: '#fff' },

  infoCard: {
    backgroundColor: colors.surfaceVariant, borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.xl,
  },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing.xl,
    ...shadows.md,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
