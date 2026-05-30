import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { Store, StoreSettings, storeService } from '../lib/store-service';

interface Props {
  visible: boolean;
  onClose: () => void;
  store: Store;
  token: string;
  onUpdate: () => void;
}

export default function StoreSettingsModal({ visible, onClose, store, token, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Partial<StoreSettings>>({});

  useEffect(() => {
    setSettings({
      name: store.name,
      address: store.address || '',
      phone: store.phone || '',
      email: store.email || '',
      description: store.description || '',
      delivery_radius_km: store.delivery_radius_km,
      delivery_fee: store.delivery_fee || 0,
      min_order_amount: store.min_order_amount || 0,
    });
  }, [store]);

  const set = (key: keyof StoreSettings, val: any) => setSettings((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (!settings.name?.trim()) { Alert.alert('Error', 'Store name is required'); return; }
    if (!settings.address?.trim()) { Alert.alert('Error', 'Store address is required'); return; }
    if (!settings.delivery_radius_km || settings.delivery_radius_km <= 0) { Alert.alert('Error', 'Delivery radius must be greater than 0'); return; }
    setLoading(true);
    try {
      const success = await storeService.updateStore(store.id, settings, token);
      if (success) { Alert.alert('Success', 'Settings updated'); onUpdate(); onClose(); }
      else { Alert.alert('Error', 'Failed to update settings'); }
    } catch { Alert.alert('Error', 'Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            {/* Header */}
            <View style={st.header}>
              <Text style={st.title}>Store Settings</Text>
              <TouchableOpacity onPress={onClose} disabled={loading} style={st.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={st.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Basic Info */}
              <Text style={st.sectionLabel}>Basic Info</Text>
              <View style={st.card}>
                <Field label="Store Name" value={settings.name} onChangeText={(t) => set('name', t)} placeholder="Your store name" disabled={loading} />
                <View style={st.divider} />
                <Field label="Address" value={settings.address} onChangeText={(t) => set('address', t)} placeholder="Full address" multiline disabled={loading} />
                <View style={st.divider} />
                <Field label="Description" value={settings.description} onChangeText={(t) => set('description', t)} placeholder="What does your store sell?" multiline disabled={loading} />
              </View>

              {/* Contact */}
              <Text style={st.sectionLabel}>Contact</Text>
              <View style={st.card}>
                <Field label="Phone" value={settings.phone} onChangeText={(t) => set('phone', t)} placeholder="Phone number" keyboard="phone-pad" disabled={loading} />
                <View style={st.divider} />
                <Field label="Email" value={settings.email} onChangeText={(t) => set('email', t)} placeholder="Email address" keyboard="email-address" autoCapitalize="none" disabled={loading} />
              </View>

              {/* Delivery */}
              <Text style={st.sectionLabel}>Delivery</Text>
              <View style={st.card}>
                <Field label="Delivery Radius (km)" value={settings.delivery_radius_km?.toString()} onChangeText={(t) => set('delivery_radius_km', parseFloat(t) || 0)} placeholder="e.g. 5" keyboard="decimal-pad" disabled={loading} />
                <View style={st.divider} />
                <Field label="Delivery Fee (₹)" value={settings.delivery_fee?.toString()} onChangeText={(t) => set('delivery_fee', parseFloat(t) || 0)} placeholder="0" keyboard="decimal-pad" disabled={loading} />
                <View style={st.divider} />
                <Field label="Min Order Amount (₹)" value={settings.min_order_amount?.toString()} onChangeText={(t) => set('min_order_amount', parseFloat(t) || 0)} placeholder="0" keyboard="decimal-pad" disabled={loading} />
              </View>

              <View style={{ height: spacing.xl }} />
            </ScrollView>

            {/* Footer */}
            <View style={st.footer}>
              <TouchableOpacity style={st.cancelBtn} onPress={onClose} disabled={loading}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.saveBtn, loading && { opacity: 0.5 }]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboard, autoCapitalize, disabled }: {
  label: string; value?: string; onChangeText: (t: string) => void; placeholder?: string;
  multiline?: boolean; keyboard?: any; autoCapitalize?: any; disabled?: boolean;
}) {
  return (
    <View style={st.field}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput
        style={[st.fieldInput, multiline && st.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        editable={!disabled}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: spacing.sm, marginLeft: spacing.xs, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: spacing.lg },
  field: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textTertiary, marginBottom: 6 },
  fieldInput: { fontSize: 15, color: colors.textPrimary, padding: 0 },
  fieldInputMulti: { minHeight: 48 },
  footer: {
    flexDirection: 'row', gap: spacing.md, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
