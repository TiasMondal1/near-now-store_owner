import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Badge, Card, Divider, InlineNotice, TextField } from "../ui";
import { colors, spacing, typography, type Tone } from "../../lib/theme";
import type { PickedDocFile, VerificationDocument } from "../../lib/verificationDocuments";
import { formatPickedFileSize } from "../../lib/verificationDocuments";
import { UploadDropzone, type UploadDropzoneState } from "./UploadDropzone";
import { FORMATS_HINT } from "./media";

export type DocumentStatus = { label: string; tone: Tone };

export type DocumentMember = {
  key: string;
  /** "Aadhaar card (front)" */
  label: string;
  doc: VerificationDocument | null;
  pendingFile?: PickedDocFile;
  /** True while this member is being saved / deleted. */
  saving: boolean;
};

export type DocumentNumberField = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  helper?: string;
  error?: string;
  keyboardType?: TextInputProps["keyboardType"];
  maxLength?: number;
  inputRef?: React.RefObject<TextInput | null>;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
};

export type DocumentCardProps = {
  title: string;
  /** "Required for verification" / "Optional — add anytime". */
  subtitle: string;
  status: DocumentStatus | null;
  /** Number field for groups that carry one (taken from the front side). */
  number?: DocumentNumberField | null;
  members: readonly DocumentMember[];
  /** Opens the picker/change sheet for one member. */
  onPressMember: (key: string) => void;
  disabled?: boolean;
  testID?: string;
};

export function dropzoneStateFor(member: DocumentMember): {
  state: UploadDropzoneState;
  previewUri: string | null;
  fileName: string | null;
  meta: string | null;
  staged: boolean;
} {
  const { doc, pendingFile, saving } = member;
  if (saving) return { state: "saving", previewUri: null, fileName: null, meta: null, staged: false };
  if (pendingFile) {
    const isPdf = pendingFile.type === "application/pdf";
    return {
      state: isPdf ? "pdf" : "preview",
      previewUri: pendingFile.uri,
      fileName: pendingFile.name,
      meta: formatPickedFileSize(pendingFile.size),
      staged: true,
    };
  }
  if (doc?.url) {
    const isPdf = doc.url.toLowerCase().includes(".pdf");
    return {
      state: isPdf ? "pdf" : "uploaded",
      previewUri: doc.url,
      fileName: "Document.pdf",
      meta: doc.file_size ?? null,
      staged: false,
    };
  }
  return { state: "empty", previewUri: null, fileName: null, meta: null, staged: false };
}

/**
 * One verification document group (Aadhaar, PAN, Trade licence, …): header
 * with status badge, optional document-number field, and one dropzone per
 * side. Rejection reasons render inline above the affected dropzone.
 */
export function DocumentCard({ title, subtitle, status, number, members, onPressMember, disabled = false, testID }: DocumentCardProps) {
  const multi = members.length > 1;
  return (
    <Card
      title={title}
      accessory={status ? <Badge label={status.label} tone={status.tone} dot /> : undefined}
      testID={testID}
    >
      <View style={styles.body}>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {number ? (
          <TextField
            ref={number.inputRef}
            label="Document number"
            value={number.value}
            onChangeText={number.onChangeText}
            placeholder={number.placeholder}
            helper={number.helper}
            error={number.error}
            keyboardType={number.keyboardType}
            maxLength={number.maxLength}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType={number.returnKeyType ?? "done"}
            onSubmitEditing={number.onSubmitEditing}
          />
        ) : null}

        {members.map((member, idx) => {
          const dz = dropzoneStateFor(member);
          // A freshly picked file supersedes the server's last verdict — the
          // shopkeeper has already acted on the rejection.
          const showRejection = !member.pendingFile && member.doc?.status === "rejected";
          return (
            <View key={member.key} style={styles.member}>
              {idx > 0 ? <Divider /> : null}
              <Text style={styles.memberLabel}>{multi ? member.label : "Document file"}</Text>
              {showRejection ? (
                <InlineNotice
                  tone="error"
                  title="Needs re-upload"
                  message={member.doc?.rejection_reason ?? "Please upload a clearer copy of this document."}
                />
              ) : null}
              <UploadDropzone
                label={member.label}
                state={dz.state}
                previewUri={dz.previewUri}
                fileName={dz.fileName}
                meta={dz.meta}
                staged={dz.staged}
                hint={FORMATS_HINT}
                onPress={() => onPressMember(member.key)}
                disabled={disabled}
              />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  subtitle: { ...typography.description, color: colors.textMuted },
  member: { gap: spacing.sm },
  memberLabel: { ...typography.label, color: colors.textSecondary },
});

export default DocumentCard;
