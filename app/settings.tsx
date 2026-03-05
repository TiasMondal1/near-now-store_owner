/**
 * Settings screen - Store settings and notifications
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { getSession } from '../session';
import { storeService, Store } from '../lib/store-service';
import StoreSettingsModal from '../components/StoreSettingsModal';
import NotificationSettings from '../components/NotificationSettings';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showStoreSettings, setShowStoreSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const session: any = await getSession();
      if (!session?.token) {
        router.replace('/landing');
        return;
      }

      setToken(session.token);

      // Fetch store
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await response.json();
      
      if (data?.stores?.[0]) {
        setStore(data.stores[0]);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreUpdate = () => {
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Store</Text>
          
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setShowStoreSettings(true)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
                <Ionicons name="storefront" size={24} color={colors.surface} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Store Settings</Text>
                <Text style={styles.settingDescription}>
                  Name, address, delivery radius
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => router.push('/business-hours')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.info }]}>
                <Ionicons name="time" size={24} color={colors.surface} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Business Hours</Text>
                <Text style={styles.settingDescription}>
                  Set your opening and closing times
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setShowNotifications(true)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warning }]}>
                <Ionicons name="notifications" size={24} color={colors.surface} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Notification Preferences</Text>
                <Text style={styles.settingDescription}>
                  Manage alerts and notifications
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventory</Text>
          
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => router.push('/low-stock-settings')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.error }]}>
                <Ionicons name="alert-circle" size={24} color={colors.surface} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Low Stock Threshold</Text>
                <Text style={styles.settingDescription}>
                  Set when to alert for low stock
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Store ID</Text>
            <Text style={styles.infoValue}>{store?.id || 'N/A'}</Text>
          </View>
        </View>
      </ScrollView>

      {store && token && (
        <>
          <StoreSettingsModal
            visible={showStoreSettings}
            onClose={() => setShowStoreSettings(false)}
            store={store}
            token={token}
            onUpdate={handleStoreUpdate}
          />
          
          {showNotifications && (
            <View style={styles.notificationContainer}>
              <NotificationSettings onClose={() => setShowNotifications(false)} />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backBtn: {
    padding: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  settingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notificationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
});
