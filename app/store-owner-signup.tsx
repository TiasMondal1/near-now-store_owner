import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { clearSession, getSession, saveSession } from "../session";
import { notificationService } from "../lib/notifications";
import { config } from "../lib/config";
import { coalesceEmail, isPlausibleEmail, normalizeSignupEmail } from "../lib/emailForApi";
import { isMapsEnabled } from "../lib/maps-env";
import { normalizeToShopkeeperRole } from "../lib/shopkeeperRole";
import { useHardwareBackTo } from "../lib/navigation";
import { colors, layout, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { fetchStoresCached, clearStoreCache } from "../lib/appCache";
import { uploadOwnerImage, OWNER_IMAGE_KEY } from "../lib/storage";
import VerificationNavBar from "../components/VerificationNavBar";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  InlineNotice,
  ListRow,
  Screen,
  Section,
  TextField,
  TopBar,
  triggerHaptic,
  useToast,
} from "../components/ui";
import { OwnerAvatar } from "../components/signup/OwnerAvatar";
import { MapPinPicker } from "../components/signup/MapPinPicker";
import { StoreDetailsView, formatPhoneForDisplay } from "../components/signup/StoreDetailsView";
import { AddressFields, EMPTY_ADDRESS, type AddressValues } from "../components/signup/AddressFields";
import { useExistingStore } from "../components/signup/useExistingStore";
import { useMapPin, type MapPinNotice } from "../components/signup/useMapPin";

const API_BASE = config.API_BASE;

const MAP_HEIGHT_MIN = 220;
const MAP_HEIGHT_MAX = 360;
const MAP_HEIGHT_FRACTION = 0.35;
/** Below this width City / State stack instead of sharing a row. */
const TWO_COLUMN_MIN_WIDTH = 400;

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
};

const SUBMIT_FAILED_MESSAGE = "We couldn't complete your registration right now. Please try again in a moment.";
const NO_CONNECTION_MESSAGE = "We couldn't reach our servers. Please check your internet connection and try again.";

function joinMissing(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export default function StoreOwnerSignupScreen() {
  const mapsEnabled = isMapsEnabled();
  const params = useLocalSearchParams();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const signupTicket = typeof params.signupTicket === "string" ? params.signupTicket : "";

  const { width, height, gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { show: showToast } = useToast();

  // ── Form fields ──────────────────────────────────────────────────────────────
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const radiusKm = "3";
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<AddressValues>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState({ ownerName: false, storeName: false, email: false });

  const ownerNameRef = useRef<TextInput>(null);
  const storeNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const houseRef = useRef<TextInput>(null);

  const setAddressField = useCallback((key: keyof AddressValues, value: string) => {
    setAddress((a) => ({ ...a, [key]: value }));
  }, []);

  // ── Map state ────────────────────────────────────────────────────────────────
  const [mapExpanded, setMapExpanded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const notify = useCallback(
    ({ title, message }: MapPinNotice) => {
      showToast({ message: message || title, tone: "error" });
    },
    [showToast]
  );

  const pin = useMapPin({ mapsEnabled, expanded: mapExpanded, onNotice: notify });

  // ── Owner photo ──────────────────────────────────────────────────────────────
  const [ownerImageUri, setOwnerImageUri] = useState<string | null>(null);
  const [uploadingOwnerImage, setUploadingOwnerImage] = useState(false);
  // Set only on the fresh (pre-signup) form — the upload is deferred until
  // handleNext succeeds and a real user id exists.
  const [pendingOwnerImageUri, setPendingOwnerImageUri] = useState<string | null>(null);

  // ── Post-signup (view-only) data ─────────────────────────────────────────────
  const existing = useExistingStore({ phone, onOwnerImage: setOwnerImageUri });
  const { viewOnly, existingStore } = existing;

  // ── Sheets / submit state ────────────────────────────────────────────────────
  const [leaveSheetVisible, setLeaveSheetVisible] = useState(false);
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Verification hub screens all reach each other with router.replace, so the
  // stack is flat: Android back on the read-only screen goes to Status instead
  // of leaving the app (spec §4.7).
  useHardwareBackTo("/pending-verification", viewOnly);

  // Android hardware back on the fresh form: same "Leave registration?"
  // confirmation as the TopBar arrow instead of exiting the app with every
  // typed field and the verified OTP ticket lost.
  useEffect(() => {
    if (viewOnly || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setLeaveSheetVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [viewOnly]);

  const patchExistingStore = async (fields: Record<string, string>) => {
    if (!existingStore?.id) return;
    const session = await getSession();
    if (!session?.token) return;
    try {
      await fetch(`${API_BASE}/store-owner/stores/${existingStore.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      clearStoreCache();
    } catch {
      /* non-fatal */
    }
  };

  // Gallery is the only photo source, so the avatar opens it directly.
  const pickOwnerImage = async () => {
    if (uploadingOwnerImage) return;
    if (viewOnly && ownerImageUri) return; // already on file — locked from here on
    try {
      const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;

      if (!viewOnly) {
        // Fresh, pre-signup form — no account/store exists yet to upload
        // against. Preview locally; handleNext uploads it once signup
        // succeeds and a user id exists.
        setPendingOwnerImageUri(uri);
        setOwnerImageUri(uri);
        return;
      }
      if (ownerImageUri) return; // already set — read-only from here on

      const session = await getSession();
      if (!session?.user?.id) {
        showToast({ message: "Your session is still loading — try again in a moment.", tone: "error" });
        return;
      }
      setOwnerImageUri(uri);
      setUploadingOwnerImage(true);
      try {
        const res = await uploadOwnerImage(session.user.id, uri);
        if (res.ok) {
          await AsyncStorage.setItem(OWNER_IMAGE_KEY, res.url);
          setOwnerImageUri(res.url);
          await patchExistingStore({ owner_image_url: res.url });
          showToast({ message: "Photo added", tone: "success" });
        } else {
          // Roll back the optimistic preview so the avatar isn't locked on a
          // photo that never uploaded — the shopkeeper can tap to retry.
          setOwnerImageUri(null);
          showToast({ message: res.error || "Could not upload your photo. Please try again.", tone: "error" });
        }
      } finally {
        setUploadingOwnerImage(false);
      }
    } catch (err) {
      console.warn("[store-owner-signup] pickOwnerImage failed:", err);
      showToast({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    }
  };

  const confirmLogout = async () => {
    await notificationService.unregister();
    await clearSession();
    router.replace("/landing");
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  const hasAddressFields = Object.values(address).some((v) => v.trim().length > 0);

  const emailNormalized = normalizeSignupEmail(email);
  const emailValid = isPlausibleEmail(emailNormalized);
  // Without a Maps key (dev builds) there is no pin to move — the UI says
  // default coordinates are used, so don't block signup there.
  const pinOk = pin.coordsConfirmed || !mapsEnabled;

  const isValid =
    ownerName.trim().length > 0 &&
    storeName.trim().length > 0 &&
    emailValid &&
    hasAddressFields &&
    pinOk &&
    Number.isFinite(pin.coords.latitude) &&
    Number.isFinite(pin.coords.longitude);

  const missingHint = useMemo(() => {
    const missing: string[] = [];
    if (!ownerName.trim()) missing.push("your name");
    if (!storeName.trim()) missing.push("your store name");
    if (!emailValid) missing.push(emailNormalized ? "a valid email" : "your email");
    if (!hasAddressFields) missing.push("an address line");
    if (missing.length === 0 && !pinOk) return "Move the map to set your pin.";
    if (missing.length === 0) return "";
    return `Add ${joinMissing(missing)}${pinOk ? "" : " and set the pin"}.`;
  }, [ownerName, storeName, emailValid, emailNormalized, hasAddressFields, pinOk]);

  const ownerNameError = touched.ownerName && !ownerName.trim() ? "Enter your name." : undefined;
  const storeNameError = touched.storeName && !storeName.trim() ? "Enter your store name." : undefined;
  const emailError =
    touched.email && !emailValid && emailNormalized.length > 0 ? "Please enter a valid email address." : undefined;

  const buildAddressString = () =>
    [address.house, address.street, address.area, address.city, address.stateName, address.postalCode]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");

  // ── Submit ───────────────────────────────────────────────────────────────────
  // Failure is shown twice on purpose: a Toast for immediate awareness and a
  // persistent InlineNotice above the button that stays until the next attempt.
  const failSubmit = (message: string) => {
    setSubmitError(message);
    showToast({ message, tone: "error" });
    triggerHaptic("error");
  };

  const handleNext = async () => {
    if (!isValid || loading) return;
    if (!phone) {
      if (__DEV__) console.warn("[store-owner-signup] submit without phone param");
      failSubmit("Your phone number is missing. Please go back and verify it again.");
      return;
    }
    setSubmitError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/store-owner/signup/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          signupTicket,
          role: "shopkeeper",
          ownerName: ownerName.trim(),
          storeName: storeName.trim(),
          storeAddress: buildAddressString(),
          radiusKm: radiusKm.trim(),
          email: emailNormalized,
          ownerEmail: emailNormalized,
          owner_email: emailNormalized,
          latitude: pin.coords.latitude,
          longitude: pin.coords.longitude,
        }),
      });
      const raw = await res.text();
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        if (!res.ok) {
          if (__DEV__) console.warn("[store-owner-signup] non-JSON failure:", res.status, raw);
          failSubmit(SUBMIT_FAILED_MESSAGE);
          return;
        }
      }
      if (!res.ok) {
        if (__DEV__) console.warn("[store-owner-signup] server rejected signup:", res.status, json);
        failSubmit(json?.error || json?.message || SUBMIT_FAILED_MESSAGE);
        return;
      }
      if (!json.success || !json.token || !json.user) {
        if (__DEV__) console.warn("[store-owner-signup] unexpected response shape:", json);
        failSubmit(json?.error || json?.message || SUBMIT_FAILED_MESSAGE);
        return;
      }
      const sessionEmail = coalesceEmail(json.user?.email, emailNormalized);
      await saveSession({
        token: json.token,
        user: {
          id: json.user.id,
          name: json.user.name,
          role: normalizeToShopkeeperRole(json.user.role),
          isActivated: json.user.isActivated ?? json.user.is_activated ?? false,
          phone: json.user.phone ?? phone,
          email: sessionEmail || undefined,
        },
      });
      triggerHaptic("success");

      // Best-effort, fire-and-forget — a photo picked before the account
      // existed gets uploaded and attached to the just-created store now that
      // a real user id/token exists. Doesn't block navigation.
      if (pendingOwnerImageUri) {
        (async () => {
          try {
            const uploadRes = await uploadOwnerImage(json.user.id, pendingOwnerImageUri);
            if (!uploadRes.ok) return;
            await AsyncStorage.setItem(OWNER_IMAGE_KEY, uploadRes.url);
            const stores = await fetchStoresCached(json.token, json.user.id);
            const newStore = stores[0];
            if (newStore?.id) {
              await fetch(`${API_BASE}/store-owner/stores/${newStore.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${json.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ owner_image_url: uploadRes.url }),
              });
              clearStoreCache();
            }
          } catch {
            /* non-fatal */
          }
        })();
      }

      router.replace("/registration-success");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const isNetwork = /network|fetch|failed to connect|connection refused/i.test(msg);
      if (__DEV__) console.warn("[store-owner-signup] complete failed:", msg);
      failSubmit(isNetwork ? NO_CONNECTION_MESSAGE : "We couldn't complete your registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render (view-only, post-signup) ──────────────────────────────────────────
  if (viewOnly) {
    return (
      <Screen>
        <Stack.Screen options={{ animation: "fade" }} />
        <TopBar title="Store details" />
        <VerificationNavBar active="details" />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.column, { width: contentWidth }]}>
            <StoreDetailsView
              ownerName={existing.ownerName}
              ownerPhone={existing.ownerPhone}
              ownerEmail={existing.ownerEmail}
              store={existingStore}
              loading={existing.loadingExisting}
              loadFailed={existing.storeLoadFailed}
              rejectedDocs={existing.rejectedDocs}
              ownerImageUri={ownerImageUri}
              uploadingOwnerImage={uploadingOwnerImage}
              onPickPhoto={pickOwnerImage}
              onRetry={existing.retryLoadStore}
              onFixDocuments={() => router.push("/upload-documents")}
              onLogout={() => setLogoutSheetVisible(true)}
            />
          </View>
        </ScrollView>

        <ConfirmSheet
          visible={logoutSheetVisible}
          onClose={() => setLogoutSheetVisible(false)}
          destructive
          icon="log-out-outline"
          title="Log out?"
          message="You'll need to verify your phone again to sign back in."
          confirmLabel="Log out"
          onConfirm={confirmLogout}
        />
      </Screen>
    );
  }

  // ── Render (fresh signup form) ────────────────────────────────────────────────
  const formWidth = Math.min(contentWidth, layout.maxFormWidth);
  const mapHeight = Math.min(MAP_HEIGHT_MAX, Math.max(MAP_HEIGHT_MIN, Math.round(height * MAP_HEIGHT_FRACTION)));
  const twoColumn = width >= TWO_COLUMN_MIN_WIDTH;

  return (
    <Screen keyboardAvoiding>
      <Stack.Screen options={{ animation: "fade" }} />
      <TopBar overline="Step 3 of 3" title="Store details" onBack={() => setLeaveSheetVisible(true)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled
      >
        <View style={[styles.column, { width: formWidth }]}>
          <Section title="Owner">
            <OwnerAvatar
              uri={ownerImageUri}
              uploading={uploadingOwnerImage}
              caption={ownerImageUri ? "Tap to change your photo" : "Add your photo (optional)"}
              onPress={pickOwnerImage}
            />
            <TextField
              ref={ownerNameRef}
              label="Your name"
              value={ownerName}
              onChangeText={setOwnerName}
              onBlur={() => setTouched((t) => ({ ...t, ownerName: true }))}
              error={ownerNameError}
              placeholder="Full name"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => storeNameRef.current?.focus()}
              blurOnSubmit={false}
            />
            <Card padded={false}>
              <ListRow
                icon="call-outline"
                iconTile
                title="Phone"
                description="Verified in the previous step"
                value={phone ? formatPhoneForDisplay(phone) : "+91 ••••••••••"}
              />
            </Card>
          </Section>

          <Section title="Store">
            <TextField
              ref={storeNameRef}
              label="Store name"
              value={storeName}
              onChangeText={setStoreName}
              onBlur={() => setTouched((t) => ({ ...t, storeName: true }))}
              error={storeNameError}
              placeholder="Fresh Mart"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
            />
            <TextField
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={setEmail}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={emailError}
              placeholder="you@store.com"
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => houseRef.current?.focus()}
              blurOnSubmit={false}
            />
            <Card padded={false}>
              <ListRow
                icon="navigate-circle-outline"
                iconTile
                title="Delivery radius"
                description="Set to 3 km for new stores"
                value={`${radiusKm} km`}
              />
            </Card>
          </Section>

          <Section
            title="Location"
            action={mapExpanded ? { label: "Hide map", onPress: () => setMapExpanded(false) } : undefined}
          >
            {mapExpanded ? (
              <MapPinPicker
                pin={pin}
                mapsEnabled={mapsEnabled}
                mapHeight={mapHeight}
                onScrollLock={(locked) => setScrollEnabled(!locked)}
              />
            ) : (
              <Card
                padded={false}
                onPress={() => setMapExpanded(true)}
                accessibilityLabel={mapsEnabled ? "Pin your store on the map" : "Store location"}
                accessibilityHint={mapsEnabled ? "Opens the map" : "Shows location details"}
              >
                <ListRow
                  icon="location-outline"
                  iconTile
                  title={mapsEnabled ? "Pin your store on the map" : "Store location"}
                  description={
                    mapsEnabled
                      ? pin.coordsConfirmed
                        ? "Tap to adjust the pin"
                        : "Pan the map to place the pin on your shop entrance"
                      : "Map unavailable — we'll place your shop from the address below."
                  }
                  trailing={
                    mapsEnabled ? (
                      <Badge
                        label={pin.coordsConfirmed ? "Pin set" : "Not set"}
                        tone={pin.coordsConfirmed ? "success" : "warning"}
                        size="sm"
                      />
                    ) : undefined
                  }
                  chevron
                />
              </Card>
            )}
          </Section>

          <Section title="Address">
            <AddressFields ref={houseRef} values={address} onChange={setAddressField} twoColumn={twoColumn} />
          </Section>

          <View style={styles.submit}>
            {submitError ? (
              <InlineNotice
                tone="error"
                title="Registration didn't go through"
                message={submitError}
                onDismiss={() => setSubmitError(null)}
              />
            ) : null}
            <Button
              label="Complete registration"
              size="lg"
              fullWidth
              onPress={handleNext}
              disabled={!isValid || loading}
              loading={loading}
            />
            {!isValid && missingHint ? (
              <Text style={styles.hint} accessibilityLiveRegion="polite">
                {missingHint}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={leaveSheetVisible}
        onClose={() => setLeaveSheetVisible(false)}
        destructive
        icon="exit-outline"
        title="Leave registration?"
        message="Your details on this page won't be saved and you'll need to verify your phone again."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => {
          router.replace("/landing");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg },
  column: { alignSelf: "center", gap: spacing.xl },
  submit: { gap: spacing.md },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
