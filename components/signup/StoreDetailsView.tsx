/**
 * Read-only "Store details" body shown to an owner who has finished signup
 * but is not yet verified. Presentation only — loading, retry, photo upload
 * and logout are all driven by the screen.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Divider, InlineNotice, KeyValueRow, Skeleton } from "../ui";
import { colors, spacing, typography } from "../../lib/theme";
import type { CachedStore } from "../../lib/appCache";
import type { VerificationDocument } from "../../lib/verificationDocuments";
import { SECTION_BY_KEY } from "../kyc";
import { OwnerAvatar } from "./OwnerAvatar";

/** "+919876543210" → "+91 98765 43210"; anything else is returned as typed. */
export function formatPhoneForDisplay(raw: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(raw.replace(/\s+/g, ""));
  return m ? `+91 ${m[1]} ${m[2]}` : raw;
}

const EMPTY = "—";

export type StoreDetailsViewProps = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  store: CachedStore | null;
  /** First load with nothing cached — rows render as skeletons. */
  loading: boolean;
  /** The last fetch failed (with or without cached content on screen). */
  loadFailed: boolean;
  rejectedDocs: VerificationDocument[];
  ownerImageUri: string | null;
  uploadingOwnerImage: boolean;
  onPickPhoto: () => void;
  onRetry: () => void;
  onFixDocuments: () => void;
  onLogout: () => void;
};

export function StoreDetailsView({
  ownerName,
  ownerPhone,
  ownerEmail,
  store,
  loading,
  loadFailed,
  rejectedDocs,
  ownerImageUri,
  uploadingOwnerImage,
  onPickPhoto,
  onRetry,
  onFixDocuments,
  onLogout,
}: StoreDetailsViewProps) {
  const photoLocked = !!ownerImageUri && !uploadingOwnerImage;
  const showSkeleton = loading && !store;

  return (
    <>
      {rejectedDocs.length > 0 ? (
        <InlineNotice
          tone="error"
          title="Action needed — a document was rejected"
          lines={rejectedDocs.map(
            (doc) => `${SECTION_BY_KEY[doc.doc_type]?.label ?? doc.doc_type}${doc.rejection_reason ? ` — ${doc.rejection_reason}` : ""}`
          )}
          action={{ label: "Fix documents", onPress: onFixDocuments }}
        />
      ) : null}

      {loadFailed && store ? (
        <InlineNotice
          tone="warning"
          title="Couldn't refresh"
          message="Showing saved data"
          action={{ label: "Retry", onPress: onRetry }}
        />
      ) : null}

      <Card
        title="Store"
        footer={
          loadFailed && !store ? (
            <InlineNotice
              tone="error"
              title="Couldn't load store details"
              action={{ label: "Retry", onPress: onRetry }}
            />
          ) : undefined
        }
      >
        <View style={styles.avatarWrap}>
          <OwnerAvatar
            uri={ownerImageUri}
            uploading={uploadingOwnerImage}
            locked={photoLocked}
            caption={
              uploadingOwnerImage ? "Uploading photo…" : photoLocked ? "Photo on file — locked" : "Tap to add your photo"
            }
            onPress={onPickPhoto}
          />
        </View>
        <Divider />
        <KeyValueRow label="Phone" value={ownerPhone ? formatPhoneForDisplay(ownerPhone) : EMPTY} showSeparator />
        <KeyValueRow label="Your name" value={ownerName || EMPTY} showSeparator />
        {showSkeleton ? (
          <Skeleton.ListRow count={1} inset leading={false} />
        ) : (
          <KeyValueRow label="Store name" value={store?.name || EMPTY} showSeparator />
        )}
        <KeyValueRow label="Email" value={ownerEmail || EMPTY} showSeparator />
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Store address</Text>
          {showSkeleton ? (
            <Skeleton.Text lines={2} />
          ) : (
            <Text style={styles.addressValue} selectable>
              {store?.address || EMPTY}
            </Text>
          )}
        </View>
      </Card>

      <InlineNotice
        tone="info"
        icon="lock-closed-outline"
        title="These details are locked for now"
        message="Name, store name, and address can't be changed here. Once you're verified, update them from your Profile page."
      />

      <Button label="Log out" variant="destructive" size="md" fullWidth leftIcon="log-out-outline" onPress={onLogout} />
    </>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: "center", paddingBottom: spacing.lg },
  addressBlock: { paddingTop: spacing.sm, gap: spacing.xs },
  addressLabel: { ...typography.label, color: colors.textMuted },
  addressValue: { ...typography.body, color: colors.textPrimary },
});

export default StoreDetailsView;
