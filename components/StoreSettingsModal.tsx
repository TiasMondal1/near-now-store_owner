/**
 * Store settings modal component
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { Store, StoreSettings, storeService } from '../lib/store-service';

interface StoreSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  store: Store;
  token: string;
  onUpdate: () => void;
}

export default function StoreSettingsModal({
  visible,
  onClose,
  store,
  token,
  onUpdate,
}: StoreSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Partial<StoreSettings>>({
    name: store.name,
    address: store.address || '',
    phone: store.phone || '',
    email: store.email || '',
    description: store.description || '',
    delivery_radius_km: store.delivery_radius_km,
    delivery_fee: store.delivery_fee || 0,
    min_order_amount: store.min_order_amount || 0,
  });

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

  const handleSave = async () => {
    if (!settings.name?.trim()) {
      Alert.alert('Error', 'Store name is required');
      return;
    }

    if (!settings.address?.trim()) {
      Alert.alert('Error', 'Store address is required');
      return;
    }

    if (!settings.delivery_radius_km || settings.delivery_radius_km <= 0) {
      Alert.alert('Error', 'Delivery radius must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      const success = await storeService.updateStore(store.id, settings, token);
      
      if (success) {
        Alert.alert('Success', 'Store settings updated successfully');
        onUpdate();
        onClose();
      } else {
        Alert.alert('Error', 'Failed to update store settings');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while updating settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Store Settings</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.label}>Store Name *</Text>
              <TextInput
                style={styles.input}
                value={settings.name}
                onChangeText={(text) => setSettings({ ...settings, name: text })}
                placeholder="Enter store name"
                placeholderTextColor={colors.textTertiary}
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.address}
                onChangeText={(text) => setSettings({ ...settings, address: text })}
                placeholder="Enter store address"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={settings.phone}
                onChangeText={(text) => setSettings({ ...settings, phone: text })}
                placeholder="Enter phone number"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={settings.email}
                onChangeText={(text) => setSettings({ ...settings, email: text })}
                placeholder="Enter email address"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.description}
                onChangeText={(text) => setSettings({ ...settings, description: text })}
                placeholder="Describe your store"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={4}
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Delivery Radius (km) *</Text>
              <TextInput
                style={styles.input}
                value={settings.delivery_radius_km?.toString()}
                onChangeText={(text) =>
                  setSettings({ ...settings, delivery_radius_km: parseFloat(text) || 0 })
                }
                placeholder="Enter delivery radius"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Delivery Fee (₹)</Text>
              <TextInput
                style={styles.input}
                value={settings.delivery_fee?.toString()}
                onChangeText={(text) =>
                  setSettings({ ...settings, delivery_fee: parseFloat(text) || 0 })
                }
                placeholder="Enter delivery fee"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Minimum Order Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={settings.min_order_amount?.toString()}
                onChangeText={(text) =>
                  setSettings({ ...settings, min_order_amount: parseFloat(text) || 0 })
                }
                placeholder="Enter minimum order amount"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
