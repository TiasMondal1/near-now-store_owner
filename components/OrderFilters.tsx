/**
 * Order filtering component
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { OrderStatus, OrderFilters as Filters } from '../lib/order-service';

interface OrderFiltersProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: Filters) => void;
  currentFilters: Filters;
}

export default function OrderFilters({
  visible,
  onClose,
  onApply,
  currentFilters,
}: OrderFiltersProps) {
  const [filters, setFilters] = useState<Filters>(currentFilters);

  const statusOptions = [
    { value: OrderStatus.PENDING, label: 'Pending' },
    { value: OrderStatus.ACCEPTED, label: 'Accepted' },
    { value: OrderStatus.READY, label: 'Ready' },
    { value: OrderStatus.COMPLETED, label: 'Completed' },
    { value: OrderStatus.CANCELLED, label: 'Cancelled' },
  ];

  const toggleStatus = (status: OrderStatus) => {
    const currentStatuses = filters.status || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
    setFilters({ ...filters, status: newStatuses });
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters({});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter Orders</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusGrid}>
              {statusOptions.map((option) => {
                const isSelected = filters.status?.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.statusChip, isSelected && styles.statusChipSelected]}
                    onPress={() => toggleStatus(option.value)}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        isSelected && styles.statusChipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Amount Range</Text>
            <View style={styles.row}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Min ₹</Text>
                <TextInput
                  style={styles.input}
                  value={filters.minAmount?.toString() || ''}
                  onChangeText={(text) =>
                    setFilters({ ...filters, minAmount: parseInt(text) || undefined })
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Max ₹</Text>
                <TextInput
                  style={styles.input}
                  value={filters.maxAmount?.toString() || ''}
                  onChangeText={(text) =>
                    setFilters({ ...filters, maxAmount: parseInt(text) || undefined })
                  }
                  keyboardType="number-pad"
                  placeholder="∞"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Search</Text>
            <TextInput
              style={styles.searchInput}
              value={filters.searchQuery || ''}
              onChangeText={(text) => setFilters({ ...filters, searchQuery: text })}
              placeholder="Search order code, customer, items..."
              placeholderTextColor={colors.textTertiary}
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
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
    maxHeight: '80%',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  statusChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  statusChipTextSelected: {
    color: colors.surface,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  resetButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    flex: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
