/**
 * "Custom product" panel of the Add products screen — the submit-for-review
 * form. Validation is inline (see customProductValidation.ts); the host
 * screen renders the submit button in a StickyFooter, disabled until the form
 * is valid with a one-line hint, and success/failure surface as a Toast (+ a
 * success InlineNotice carrying the review explanation).
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { getSession } from "../../session";
import { addCustomMasterProduct, getMasterProductCategories, type LoosePricingBasis } from "../../lib/storeProducts";
import { InlineNotice, Switch, TextField, triggerHaptic, useToast, type TextFieldProps } from "../ui";
import { colors, radius, shadows, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import { formatCategoryLabel } from "./catalog";
import { Pill } from "./Pill";
import { ProductPhotoField } from "./ProductPhotoField";
import {
  EMPTY_CUSTOM_PRODUCT,
  LOOSE_BASES,
  PACK_UNITS,
  buildSubmission,
  customProductHint,
  firstInvalidField,
  resolveUnit,
  validateCustomProduct,
  type CustomProductField,
  type CustomProductValues,
} from "./customProductValidation";

/** Anything with `measureInWindow` — a `View` or a `TextInput`. */
export type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void };

/** What the host's StickyFooter needs to render the submit button and its hint. */
export type CustomProductFooterState = {
  /** Form valid, session present, not saving. */
  canSubmit: boolean;
  saving: boolean;
  /** One-line "what's missing" hint, or null when the form is valid. */
  hint: string | null;
  /** undefined = session still loading; null = no session. */
  token: string | null | undefined;
};

/** Imperative handle for the host's footer button. */
export type CustomProductPanelHandle = {
  submit: () => void;
  /** Reveals every error and scrolls/focuses the first invalid field. */
  focusFirstInvalid: () => void;
};

export type CustomProductPanelProps = {
  /** Called after a successful submission (the catalog re-fetches its store map). */
  onAdded: () => void;
  /** Scrolls the host ScrollView so `node` is near the top (used for non-text fields). */
  scrollToView: (node: Measurable) => void;
  /** Fires whenever the submit button's state (enabled / busy / hint) changes. */
  onFooterStateChange: (state: CustomProductFooterState) => void;
};

type Touched = Partial<Record<CustomProductField, boolean>>;

/** Old grey form section: `surfaceVariant` box, `radius.lg`, 10/700 uppercase eyebrow. */
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {label}
      </Text>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

/** Old input look on top of `TextField`: white box, 14/500 text. Labels stay 13px. */
const INPUT_LOOK: Pick<TextFieldProps, "fieldStyle" | "inputStyle"> = {
  fieldStyle: { backgroundColor: colors.surface },
  inputStyle: { fontSize: 14, fontWeight: "500" },
};

export const CustomProductPanel = forwardRef<CustomProductPanelHandle, CustomProductPanelProps>(function CustomProductPanel(
  { onAdded, scrollToView, onFooterStateChange },
  ref
) {
  const toast = useToast();
  const { isWide } = useLayout();

  const [values, setValues] = useState<CustomProductValues>(EMPTY_CUSTOM_PRODUCT);
  const [touched, setTouched] = useState<Touched>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // undefined = still loading; null = no session.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [categories, setCategories] = useState<string[]>([]);

  // Token for the form is loaded independently (as before).
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => {
        if (!cancelled) setToken(s?.token ?? null);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Category suggestions (same cached call the catalog uses). The field stays free text.
  useEffect(() => {
    let cancelled = false;
    getMasterProductCategories()
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<CustomProductValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);
  const touch = useCallback((field: CustomProductField) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const errors = useMemo(() => validateCustomProduct(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const visible = useCallback(
    (field: CustomProductField): string | undefined => (showAllErrors || touched[field] ? errors[field] : undefined),
    [errors, showAllErrors, touched]
  );
  const unitPreview = resolveUnit(values);
  const hint = customProductHint(errors);

  // ── Refs for focus / scroll-to-first-invalid ──
  const nameRef = useRef<TextInput>(null);
  const brandRef = useRef<TextInput>(null);
  const categoryRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);
  const packAmountRef = useRef<TextInput>(null);
  const basePriceRef = useRef<TextInput>(null);
  const discountedPriceRef = useRef<TextInput>(null);
  const minQtyRef = useRef<TextInput>(null);
  const maxQtyRef = useRef<TextInput>(null);
  const photoSectionRef = useRef<View>(null);
  const packagingSectionRef = useRef<View>(null);

  const focusField = useCallback(
    (field: CustomProductField) => {
      const textRefs: Partial<Record<CustomProductField, React.RefObject<TextInput | null>>> = {
        name: nameRef,
        category: categoryRef,
        packAmount: packAmountRef,
        basePrice: basePriceRef,
        discountedPrice: discountedPriceRef,
        minQty: minQtyRef,
        maxQty: maxQtyRef,
      };
      const textRef = textRefs[field]?.current;
      if (textRef) {
        scrollToView(textRef);
        textRef.focus();
        return;
      }
      if (field === "image") {
        if (!values.imageBase64 && urlRef.current) {
          scrollToView(urlRef.current);
          urlRef.current.focus();
        } else if (photoSectionRef.current) {
          scrollToView(photoSectionRef.current);
        }
        return;
      }
      if (packagingSectionRef.current) scrollToView(packagingSectionRef.current);
    },
    [scrollToView, values.imageBase64]
  );

  const focusFirstInvalid = useCallback(() => {
    setShowAllErrors(true);
    const field = firstInvalidField(errors);
    if (field) focusField(field);
  }, [errors, focusField]);

  // ── Packaging handlers (unchanged semantics) ──
  const setLoose = useCallback(
    (on: boolean) => {
      setValues((prev) => ({ ...prev, isLoose: on, looseBasis: on ? (prev.looseBasis ?? "kg") : null }));
    },
    []
  );

  // ── Submit ──
  const canSubmit = isValid && !!token && !saving;
  const submit = useCallback(async () => {
    if (!isValid) {
      focusFirstInvalid();
      return;
    }
    if (!token) return;
    setSaving(true);
    try {
      const result = await addCustomMasterProduct(buildSubmission(values), token);
      if (!result.success) {
        void triggerHaptic("error");
        toast.show({ message: result.error || "Couldn't submit the product. Try again.", tone: "error" });
        return;
      }
      onAdded();
      void triggerHaptic("success");
      toast.show({
        message: "Submitted for review",
        tone: "success",
        action: { label: "View submissions", onPress: () => router.push("/product-submissions") },
      });
      setSubmitted(true);
      setValues(EMPTY_CUSTOM_PRODUCT);
      setTouched({});
      setShowAllErrors(false);
    } finally {
      setSaving(false);
    }
  }, [isValid, token, values, onAdded, toast, focusFirstInvalid]);

  useImperativeHandle(ref, () => ({ submit: () => void submit(), focusFirstInvalid }), [submit, focusFirstInvalid]);
  useEffect(() => {
    onFooterStateChange({ canSubmit, saving, hint, token });
  }, [onFooterStateChange, canSubmit, saving, hint, token]);

  const looseBasisLabel = LOOSE_BASES.find((b) => b.key === values.looseBasis);
  const pricingTitle = values.isLoose && looseBasisLabel ? `Pricing (₹) · ${looseBasisLabel.per}` : "Pricing (₹)";
  const normalizedCategory = values.category.trim().toLowerCase();

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="add-circle" size={24} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Add Custom Product
          </Text>
          <Text style={styles.subtitle}>Submitted for admin review before it&apos;s added to your store.</Text>
        </View>
      </View>

      {submitted ? (
        <InlineNotice
          tone="success"
          title="Submitted for review"
          message="Our team will review it. Once approved, it's added to your store automatically and you'll be notified."
          action={{ label: "View submissions", onPress: () => router.push("/product-submissions") }}
          onDismiss={() => setSubmitted(false)}
        />
      ) : null}

      {/* ── Basic info ── */}
      <FormSection label="Basic info">
        <TextField
          ref={nameRef}
          label="Product name"
          placeholder="e.g. Amul Butter"
          value={values.name}
          onChangeText={(t) => update({ name: t })}
          onBlur={() => touch("name")}
          error={visible("name")}
          returnKeyType="next"
          onSubmitEditing={() => brandRef.current?.focus()}
          autoCapitalize="words"
          disabled={saving}
          {...INPUT_LOOK}
        />
        <View style={isWide ? styles.twoUp : styles.fields}>
          <TextField
            ref={brandRef}
            label="Brand"
            helper="Optional"
            placeholder="e.g. Amul"
            value={values.brand}
            onChangeText={(t) => update({ brand: t })}
            returnKeyType="next"
            onSubmitEditing={() => categoryRef.current?.focus()}
            autoCapitalize="words"
            disabled={saving}
            containerStyle={styles.flex}
            {...INPUT_LOOK}
          />
          <TextField
            ref={categoryRef}
            label="Category"
            placeholder="e.g. Dairy"
            value={values.category}
            onChangeText={(t) => update({ category: t })}
            onBlur={() => touch("category")}
            error={visible("category")}
            returnKeyType="next"
            onSubmitEditing={() => descriptionRef.current?.focus()}
            autoCapitalize="words"
            disabled={saving}
            containerStyle={styles.flex}
            {...INPUT_LOOK}
          />
        </View>
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chipRow}
            accessibilityLabel="Category suggestions"
          >
            {categories.map((cat) => (
              <Pill
                key={cat}
                label={formatCategoryLabel(cat)}
                selected={normalizedCategory === cat.trim().toLowerCase()}
                onPress={() => {
                  update({ category: cat });
                  touch("category");
                }}
                disabled={saving}
              />
            ))}
          </ScrollView>
        ) : null}
        <TextField
          ref={descriptionRef}
          label="Description"
          helper="Optional"
          placeholder="What makes this product worth buying?"
          value={values.description}
          onChangeText={(t) => update({ description: t })}
          multiline
          disabled={saving}
          fieldStyle={[INPUT_LOOK.fieldStyle, styles.multiline]}
          inputStyle={INPUT_LOOK.inputStyle}
        />
      </FormSection>

      {/* ── Product photo ── */}
      <View ref={photoSectionRef} collapsable={false}>
        <FormSection label="Product image *">
          <ProductPhotoField
            ref={urlRef}
            imageUri={values.imageUri}
            hasPhoto={values.imageBase64 != null}
            imageUrlLink={values.imageUrlLink}
            onImageUrlChange={(t) => update({ imageUrlLink: t })}
            onImageUrlBlur={() => touch("image")}
            onPicked={(uri, base64) => {
              update({ imageUri: uri, imageBase64: base64 });
              touch("image");
            }}
            onRemove={() => update({ imageUri: null, imageBase64: null })}
            error={visible("image")}
            disabled={saving}
          />
        </FormSection>
      </View>

      {/* ── Packaging ── */}
      <View ref={packagingSectionRef} collapsable={false}>
        <FormSection label="Packaging">
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>Loose item (weighed at counter)</Text>
              <Text style={styles.switchHint}>Off = fixed pack size (e.g. 200g, 1L). On = priced per kg or litre.</Text>
            </View>
            <Switch value={values.isLoose} onValueChange={setLoose} accessibilityLabel="Loose item" disabled={saving} />
          </View>
          {values.isLoose ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Priced per *</Text>
              <View style={styles.chipWrap}>
                {LOOSE_BASES.map((b) => (
                  <Pill
                    key={b.key}
                    variant="form"
                    label={b.label}
                    selected={values.looseBasis === b.key}
                    onPress={() => update({ looseBasis: b.key as LoosePricingBasis })}
                    disabled={saving}
                  />
                ))}
              </View>
              {visible("looseBasis") ? (
                <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {visible("looseBasis")}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.packRow}>
              <View style={styles.flex}>
                <TextField
                  ref={packAmountRef}
                  label="Pack amount *"
                  placeholder="e.g. 200"
                  value={values.packAmount}
                  onChangeText={(t) => update({ packAmount: t })}
                  onBlur={() => {
                    touch("packAmount");
                    touch("packSuffix");
                  }}
                  error={visible("packAmount")}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  disabled={saving}
                  {...INPUT_LOOK}
                />
              </View>
              <View style={[styles.fieldGroup, styles.packUnits]}>
                <Text style={styles.label}>Pack unit *</Text>
                <View style={styles.chipWrap}>
                  {PACK_UNITS.map((u) => (
                    <Pill
                      key={u}
                      variant="form"
                      label={u}
                      selected={values.packSuffix === u}
                      onPress={() => {
                        update({ packSuffix: u });
                        touch("packSuffix");
                      }}
                      disabled={saving}
                    />
                  ))}
                </View>
                {visible("packSuffix") ? (
                  <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {visible("packSuffix")}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          {unitPreview ? (
            <Text style={styles.unitPreview}>
              Unit: <Text style={styles.unitPreviewValue}>{unitPreview}</Text>
            </Text>
          ) : null}
        </FormSection>
      </View>

      {/* ── Pricing ── */}
      <FormSection label={pricingTitle}>
        <View style={isWide ? styles.twoUp : styles.fields}>
          <TextField
            ref={basePriceRef}
            label="MRP / Base *"
            placeholder="0.00"
            helper="Blank counts as ₹0"
            value={values.basePrice}
            onChangeText={(t) => update({ basePrice: t })}
            onBlur={() => touch("basePrice")}
            error={visible("basePrice")}
            keyboardType="decimal-pad"
            returnKeyType="next"
            onSubmitEditing={() => discountedPriceRef.current?.focus()}
            containerStyle={styles.flex}
            disabled={saving}
            {...INPUT_LOOK}
          />
          <TextField
            ref={discountedPriceRef}
            label="Selling price *"
            placeholder="0.00"
            helper="Must not exceed the MRP"
            value={values.discountedPrice}
            onChangeText={(t) => update({ discountedPrice: t })}
            onBlur={() => touch("discountedPrice")}
            error={visible("discountedPrice")}
            keyboardType="decimal-pad"
            returnKeyType="done"
            containerStyle={styles.flex}
            disabled={saving}
            {...INPUT_LOOK}
          />
        </View>
      </FormSection>

      {/* ── Order limits ── */}
      <FormSection label="Order limits (optional)">
        <View style={styles.twoUp}>
          <TextField
            ref={minQtyRef}
            label="Min qty"
            placeholder="1"
            helper="Default 1"
            value={values.minQty}
            onChangeText={(t) => update({ minQty: t })}
            onBlur={() => touch("minQty")}
            error={visible("minQty")}
            keyboardType="decimal-pad"
            returnKeyType="next"
            onSubmitEditing={() => maxQtyRef.current?.focus()}
            containerStyle={styles.flex}
            disabled={saving}
            {...INPUT_LOOK}
          />
          <TextField
            ref={maxQtyRef}
            label="Max qty"
            placeholder="100"
            helper="Default 100"
            value={values.maxQty}
            onChangeText={(t) => update({ maxQty: t })}
            onBlur={() => touch("maxQty")}
            error={visible("maxQty")}
            keyboardType="decimal-pad"
            returnKeyType="done"
            containerStyle={styles.flex}
            disabled={saving}
            {...INPUT_LOOK}
          />
        </View>
      </FormSection>
    </View>
  );
});

const styles = StyleSheet.create({
  // Old "Add Custom Product" card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.xs },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "0C",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { color: colors.textTertiary, fontSize: 12, marginTop: 2, lineHeight: 17, fontWeight: "400" },

  // Grey section boxes
  section: { backgroundColor: colors.surfaceVariant, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: spacing.xs, textTransform: "uppercase" },

  fields: { gap: spacing.md },
  fieldGroup: { gap: spacing.sm },
  flex: { flex: 1 },
  twoUp: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  packRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  packUnits: { flex: 2 },
  multiline: { minHeight: 68 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  label: { ...typography.label, color: colors.textSecondary },

  switchRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: spacing.xs, gap: spacing.sm },
  switchTextCol: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  switchLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  switchHint: { color: colors.textTertiary, fontSize: 11, marginTop: 4, lineHeight: 16, fontWeight: "400" },

  unitPreview: { color: colors.textTertiary, fontSize: 12, marginTop: spacing.xs, fontWeight: "500" },
  unitPreviewValue: { color: colors.primary, fontWeight: "700" },
  errorText: { ...typography.caption, color: colors.errorText },
});

export default CustomProductPanel;
