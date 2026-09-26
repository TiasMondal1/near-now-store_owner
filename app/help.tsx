import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../lib/theme';
import { useLayout, useBottomPadding } from '../lib/useLayout';
import { apiClient } from '../lib/api-client';
import { getSession } from '../session';
import {
  Button,
  Card,
  Chip,
  Divider,
  InlineNotice,
  KeyValueRow,
  ListRow,
  Screen,
  Section,
  TextField,
  TopBar,
  useToast,
} from '../components/ui';
import { FaqAccordion, SupportMessageRow, type FaqEntry, type SupportMessage } from '../components/profile';

const SUPPORT_PHONE = '+918282070270';
const SUPPORT_PHONE_DISPLAY = '+91 82820 70270';
const SUPPORT_EMAIL = 'nearandnowofficial2025@gmail.com';
const SUPPORT_WHATSAPP = '918282070270';

const FAQ: readonly FaqEntry[] = [
  { q: 'How do I go online?', a: 'On Home, tap Go online on the Store status card. Customers only see your store while it is online.' },
  { q: 'How do I add products?', a: 'Open Inventory and tap the + button at the top right. Pick items from the catalog or fill in the custom product form; custom products are reviewed before they go live.' },
  { q: 'How do I accept an order?', a: 'Open Orders › Incoming, choose the items you can supply and tap Accept.' },
  { q: 'When do I get paid?', a: 'The Payouts tab shows the value of your delivered orders by day, week and all time. Near & Now charges no platform fees, so the full order value is paid out to you. Contact support if a payout looks incorrect.' },
  { q: 'How do I change my store name or address?', a: 'Open Settings › Profile and tap Edit to update your store name, address and contact phone. Changes are reviewed before they go live.' },
  { q: 'What is the pickup code?', a: 'A pickup code is generated when you accept an order. Share it with the delivery partner when they arrive to collect the order.' },
  { q: 'Can I reject an order?', a: 'Yes — tap Reject on the incoming order card. This cannot be undone; the order is reassigned to another store.' },
  { q: 'How do I remove a product or mark it unavailable?', a: 'In Inventory, use the availability switch on a product to take it off sale temporarily. To remove it from your store, tap the ⋮ button on its row and choose Remove product, then confirm.' },
  { q: 'My store is online but I am not getting orders', a: 'Check that your products in Inventory are switched on and that your store address is correct. Your delivery radius is set by the Near & Now team — contact support from this screen if you need it changed.' },
];

const QUICK_MESSAGES = [
  'I am not receiving orders',
  'Payment not received',
  'Need to update my store details',
  'App is not working properly',
  'I want to deactivate my store',
  'Other issue',
];

type SentMessage = SupportMessage;

export default function HelpScreen() {
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  // The FAQ/contact options still work when this fails, but the failure is
  // surfaced (with Retry) rather than silently hiding earlier messages and
  // any admin replies.
  const [messagesError, setMessagesError] = useState(false);

  const loadMessages = useCallback(async () => {
    setMessagesError(false);
    try {
      const session = await getSession();
      if (!session?.token) return;
      const res = await apiClient.get<{ messages: SentMessage[] }>('/store-owner/support-messages', {
        Authorization: `Bearer ${session.token}`,
      });
      if (res.success && res.data) {
        setSentMessages(res.data.messages);
      } else {
        setMessagesError(true);
      }
    } catch {
      setMessagesError(true);
    }
  }, []);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() =>
      toast.show({ message: "Couldn't open the dialer.", tone: 'error' })
    );
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Store Owner Support`).catch(() =>
      toast.show({ message: "Couldn't open your email app.", tone: 'error' })
    );
  };

  const handleWhatsApp = (prefill?: string) => {
    const text = encodeURIComponent(prefill || message || 'Hi, I need help with my store.');
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`).catch(() =>
      toast.show({ message: "Couldn't open WhatsApp.", tone: 'error' })
    );
  };

  const canSend = message.trim().length > 0 && !sending;

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const session = await getSession();
      if (!session?.token) {
        setSendError('Your session has expired. Please log in again.');
        return;
      }
      const res = await apiClient.post('/store-owner/support-messages', { message: message.trim() }, {
        Authorization: `Bearer ${session.token}`,
      });
      if (!res.success) throw new Error(res.error || 'Failed to send message');
      toast.show({ message: 'Message sent. We will get back to you shortly.', tone: 'success' });
      setMessage('');
      void loadMessages();
    } catch (err: any) {
      setSendError(err?.message || 'Please check your connection and try again, or use Call, WhatsApp or Email above.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <TopBar title="Help & support" backHref="/settings" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { width: contentWidth }]}>
          <Section title="Get in touch">
            <Card padded={false}>
              <ListRow
                icon="call-outline"
                iconTile
                title="Call us"
                description={SUPPORT_PHONE_DISPLAY}
                chevron
                showSeparator
                onPress={handleCall}
                accessibilityHint="Opens the phone dialer"
              />
              <ListRow
                icon="logo-whatsapp"
                iconTile
                title="WhatsApp"
                description="Chat with us"
                chevron
                showSeparator
                onPress={() => handleWhatsApp()}
                accessibilityHint="Opens WhatsApp"
              />
              <ListRow
                icon="mail-outline"
                iconTile
                title="Email"
                description={SUPPORT_EMAIL}
                chevron
                onPress={handleEmail}
                accessibilityHint="Opens your email app"
              />
            </Card>
          </Section>

          <Section title="Quick help">
            <Text style={styles.hint}>Tap a topic to send it to us on WhatsApp</Text>
            <View style={styles.topics}>
              {QUICK_MESSAGES.map((msg) => (
                <Chip
                  key={msg}
                  label={msg}
                  onPress={() => handleWhatsApp(`Hi, I need help: ${msg}`)}
                  accessibilityLabel={`${msg}, opens WhatsApp`}
                />
              ))}
            </View>
          </Section>

          <Section title="Send a message">
            <Card>
              <View style={styles.form}>
                {sendError ? <InlineNotice tone="error" title="Couldn't send message" message={sendError} /> : null}
                <TextField
                  label="Your message"
                  value={message}
                  onChangeText={(t) => { setMessage(t); if (sendError) setSendError(null); }}
                  placeholder="Describe your issue..."
                  multiline
                  disabled={sending}
                  helper={message.trim() ? undefined : 'Type a message to enable Send'}
                />
                <Button
                  label="Send"
                  leftIcon="send-outline"
                  fullWidth
                  loading={sending}
                  disabled={!canSend}
                  onPress={handleSendMessage}
                />
              </View>
            </Card>
          </Section>

          {/* Sent messages + admin replies — previously the only way to know a
              message was ever seen was the "Sent" alert; there was no way to
              check back for a response. */}
          {sentMessages.length > 0 || messagesError ? (
            <Section title="Your messages" count={sentMessages.length || undefined}>
              {messagesError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't load your messages"
                  message={sentMessages.length > 0 ? 'Showing saved data' : 'Check your connection and try again.'}
                  action={{ label: 'Retry', onPress: () => void loadMessages() }}
                />
              ) : null}
              {sentMessages.length > 0 ? (
                <Card padded={false}>
                  {sentMessages.map((m, idx) => (
                    <React.Fragment key={m.id}>
                      <SupportMessageRow item={m} />
                      {idx < sentMessages.length - 1 ? <Divider /> : null}
                    </React.Fragment>
                  ))}
                </Card>
              ) : null}
            </Section>
          ) : null}

          <Section title="Frequently asked questions">
            <Card padded={false}>
              <FaqAccordion items={FAQ} />
            </Card>
          </Section>

          <Section title="Support hours">
            <Card>
              <KeyValueRow label="Mon–Sat" value="9:00 AM – 9:00 PM" showSeparator />
              <KeyValueRow label="Sunday" value="10:00 AM – 6:00 PM" />
            </Card>
          </Section>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: 'center' },
  column: { gap: spacing.xl },
  hint: { ...typography.caption, color: colors.textMuted },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  form: { gap: spacing.md },
});
