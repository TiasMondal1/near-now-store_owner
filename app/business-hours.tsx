import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';
import { getSession } from '../session';
import { config } from '../lib/config';
import { fetchStoresCached, peekStores, clearStoreCache } from '../lib/appCache';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type DayHours = { open: string; close: string; isOpen: boolean };
type WeekHours = Record<string, DayHours>;

const DEFAULT_HOURS: WeekHours = Object.fromEntries(
  DAYS.map((d) => [d, { open: '09:00', close: '21:00', isOpen: d !== 'Sunday' }])
);

export default function BusinessHoursScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState<WeekHours>(DEFAULT_HOURS);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) { router.replace('/landing'); return; }
      setToken(s.token);
      const cached = peekStores();
      const sid = cached?.[0]?.id || (await fetchStoresCached(s.token, s.user?.id))?.[0]?.id;
      setStoreId(sid || null);
      // Load saved hours from store if available
      const storeData = cached?.[0] as any;
      if (storeData?.business_hours) {
        try { setHours({ ...DEFAULT_HOURS, ...JSON.parse(storeData.business_hours) }); } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const toggleDay = (day: string) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], isOpen: !prev[day].isOpen } }));
  };

  const cycleTime = (day: string, field: 'open' | 'close', direction: 1 | -1) => {
    setHours((prev) => {
      const current = prev[day][field];
      const [h, m] = current.split(':').map(Number);
      let totalMins = h * 60 + m + direction * 30;
      if (totalMins < 0) totalMins = 23 * 60 + 30;
      if (totalMins >= 24 * 60) totalMins = 0;
      const newH = Math.floor(totalMins / 60);
      const newM = totalMins % 60;
      const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
      return { ...prev, [day]: { ...prev[day], [field]: newTime } };
    });
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const handleSave = async () => {
    if (!token || !storeId) return;
    setSaving(true);
    try {
      await fetch(`${config.API_BASE}/store-owner/stores/${storeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_hours: JSON.stringify(hours) }),
      });
      clearStoreCache();
      Alert.alert('Saved', 'Business hours updated');
    } catch { Alert.alert('Error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.title}>Business Hours</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Text style={st.sectionLabel}>Set your store's operating hours</Text>

        <View style={st.card}>
          {DAYS.map((day, idx) => {
            const d = hours[day];
            return (
              <React.Fragment key={day}>
                <View style={st.dayRow}>
                  <View style={st.dayLeft}>
                    <Switch
                      value={d.isOpen}
                      onValueChange={() => toggleDay(day)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                    />
                    <View>
                      <Text style={[st.dayName, !d.isOpen && st.dayNameOff]}>{SHORT[idx]}</Text>
                      {!d.isOpen && <Text style={st.closedLabel}>Closed</Text>}
                    </View>
                  </View>

                  {d.isOpen && (
                    <View style={st.timesRow}>
                      <TimeControl value={d.open} onUp={() => cycleTime(day, 'open', 1)} onDown={() => cycleTime(day, 'open', -1)} label={formatTime(d.open)} />
                      <Text style={st.timeDash}>–</Text>
                      <TimeControl value={d.close} onUp={() => cycleTime(day, 'close', 1)} onDown={() => cycleTime(day, 'close', -1)} label={formatTime(d.close)} />
                    </View>
                  )}
                </View>
                {idx < DAYS.length - 1 && <View style={st.divider} />}
              </React.Fragment>
            );
          })}
        </View>

        <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.saveBtnText}>Save Hours</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function TimeControl({ label, onUp, onDown }: { label: string; value: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={st.timeControl}>
      <TouchableOpacity onPress={onDown} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={14} color={colors.textTertiary} />
      </TouchableOpacity>
      <Text style={st.timeText}>{label}</Text>
      <TouchableOpacity onPress={onUp} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
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
  sectionLabel: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56,
  },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  dayNameOff: { color: colors.textTertiary },
  closedLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: spacing.lg },

  timesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeControl: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  timeText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, minWidth: 64, textAlign: 'center' },
  timeDash: { fontSize: 13, color: colors.textTertiary },

  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing.xl,
    ...shadows.md,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
