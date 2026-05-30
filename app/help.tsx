import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Linking, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../lib/theme';

const SUPPORT_PHONE = '+919876543210';
const SUPPORT_EMAIL = 'support@nearandnow.in';
const SUPPORT_WHATSAPP = '919876543210';

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I go online?', a: 'Go to Home tab and toggle the switch in the Store Status card. Your store will be visible to customers once online.' },
  { q: 'How do I add products?', a: 'Go to Inventory tab, switch to the Inventory view, browse the catalog and tap "Add" on products you want to sell.' },
  { q: 'How do I accept an order?', a: 'Go to Orders tab > Incoming. You can select which items to accept and tap the Accept button.' },
  { q: 'When do I get paid?', a: 'Payouts are processed after orders are delivered. Check the Payouts tab for your earnings history.' },
  { q: 'How do I change my store name or address?', a: 'Go to Settings > Store Settings. You can update your store name, address, delivery radius, and more.' },
  { q: 'What is the pickup code?', a: 'After accepting an order, a pickup code is generated. Share this code with the delivery partner when they arrive to collect the order.' },
  { q: 'How do I set business hours?', a: 'Go to Settings > Business Hours. Toggle each day on/off and set opening and closing times.' },
  { q: 'Can I reject an order?', a: 'Yes. On the incoming order card, tap Reject. This cannot be undone — the order will be reassigned to another store.' },
  { q: 'How do I remove a product?', a: 'Go to Home > Your Stock, expand the list, and tap the trash icon next to the product you want to remove.' },
  { q: 'My store is online but I am not getting orders', a: 'Make sure you have active products, your delivery radius is set correctly, and your business hours cover the current time.' },
];

const QUICK_MESSAGES = [
  'I am not receiving orders',
  'Payment not received',
  'Need to update my store details',
  'App is not working properly',
  'I want to deactivate my store',
  'Other issue',
];

export default function HelpScreen() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => Alert.alert('Error', 'Could not open dialer'));
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Store Owner Support`).catch(() => Alert.alert('Error', 'Could not open email app'));
  };

  const handleWhatsApp = (prefill?: string) => {
    const text = encodeURIComponent(prefill || message || 'Hi, I need help with my store.');
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`).catch(() => Alert.alert('Error', 'Could not open WhatsApp'));
  };

  const handleSendMessage = async () => {
    if (!message.trim()) { Alert.alert('Empty', 'Please type a message'); return; }
    setSending(true);
    // Simulate send — in production this would hit an API
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);
    Alert.alert('Sent', 'Your message has been sent. We will get back to you shortly.');
    setMessage('');
  };

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Contact options */}
        <Text style={st.sectionLabel}>Get in touch</Text>
        <View style={st.contactRow}>
          <TouchableOpacity style={st.contactCard} onPress={handleCall} activeOpacity={0.6}>
            <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
            <Text style={st.contactTitle}>Call Us</Text>
            <Text style={st.contactDesc}>Talk to support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.contactCard} onPress={() => handleWhatsApp()} activeOpacity={0.6}>
            <Ionicons name="logo-whatsapp" size={20} color={colors.textSecondary} />
            <Text style={st.contactTitle}>WhatsApp</Text>
            <Text style={st.contactDesc}>Chat with us</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.contactCard} onPress={handleEmail} activeOpacity={0.6}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <Text style={st.contactTitle}>Email</Text>
            <Text style={st.contactDesc}>Write to us</Text>
          </TouchableOpacity>
        </View>

        {/* Quick messages */}
        <Text style={st.sectionLabel}>Quick help</Text>
        <Text style={st.quickHelpHint}>Tap a topic to send via WhatsApp</Text>
        <View style={st.quickGrid}>
          {QUICK_MESSAGES.map((msg, idx) => (
            <TouchableOpacity
              key={idx}
              style={st.quickChip}
              onPress={() => handleWhatsApp(`Hi, I need help: ${msg}`)}
              activeOpacity={0.6}
            >
              <Text style={st.quickChipText}>{msg}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Send a message */}
        <Text style={st.sectionLabel}>Send a message</Text>
        <View style={st.messageCard}>
          <TextInput
            style={st.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue..."
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[st.sendBtn, (!message.trim() || sending) && { opacity: 0.4 }]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sending}
            activeOpacity={0.7}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={st.sendBtnText}>Send</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* FAQ */}
        <Text style={st.sectionLabel}>Frequently asked questions</Text>
        <View style={st.faqCard}>
          {FAQ.map((item, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <React.Fragment key={idx}>
                <TouchableOpacity
                  style={st.faqRow}
                  onPress={() => setExpandedFaq(isOpen ? null : idx)}
                  activeOpacity={0.6}
                >
                  <Text style={st.faqQuestion}>{item.q}</Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                </TouchableOpacity>
                {isOpen && (
                  <View style={st.faqAnswer}>
                    <Text style={st.faqAnswerText}>{item.a}</Text>
                  </View>
                )}
                {idx < FAQ.length - 1 && <View style={st.divider} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* Support hours */}
        <View style={st.infoCard}>
          <Text style={st.infoTitle}>Support hours</Text>
          <Text style={st.infoText}>Mon–Sat: 9:00 AM – 9:00 PM</Text>
          <Text style={st.infoText}>Sunday: 10:00 AM – 6:00 PM</Text>
        </View>

        <View style={{ height: 40 }} />
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: spacing.sm, marginLeft: spacing.xs, marginTop: spacing.lg },

  // Contact cards
  contactRow: { flexDirection: 'row', gap: spacing.sm },
  contactCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  contactTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  contactDesc: { fontSize: 11, color: colors.textTertiary },

  // Quick help
  quickHelpHint: { fontSize: 12, color: colors.textTertiary, marginBottom: spacing.sm, marginLeft: spacing.xs },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: {
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  quickChipText: { fontSize: 13, color: colors.textPrimary },

  // Message
  messageCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  messageInput: {
    padding: spacing.lg, fontSize: 14, color: colors.textPrimary,
    minHeight: 100,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, margin: spacing.md, marginTop: 0,
    paddingVertical: 12, borderRadius: radius.sm,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // FAQ
  faqCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  faqRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md,
  },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary, lineHeight: 20 },
  faqAnswer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  faqAnswerText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: spacing.lg },

  // Info
  infoCard: {
    backgroundColor: colors.surfaceVariant, borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.xl, gap: 4,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  infoText: { fontSize: 13, color: colors.textTertiary },
});
