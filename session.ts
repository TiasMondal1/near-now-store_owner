import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { clearStoreCache } from "./lib/appCache";

const SESSION_KEY = "nearandnow_session";
const TOKEN_KEY = "nearandnow_shopkeeper_token";
const INSTALL_TOKEN_KEY = "nearandnow_install_token";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type UserSession = {
  token: string;
  expiresAt: number; // Unix ms timestamp
  user: {
    id: string;
    name: string;
    role: string;
    isActivated: boolean;
    phone?: string;
    email?: string;
  };
};

// In-memory cache — guarantees getSession() returns immediately after saveSession()
// without relying on AsyncStorage/SecureStore flush timing (both async on Android).
let _memSession: UserSession | null = null;

/** True when a session was saved in this JS runtime (i.e. user just logged in). */
export function isJustLoggedIn(): boolean {
  return _memSession !== null;
}

export async function saveSession(session: Omit<UserSession, 'expiresAt'> & { expiresAt?: number }) {
  const withExpiry: UserSession = {
    ...session,
    expiresAt: session.expiresAt ?? Date.now() + SESSION_TTL_MS,
  };
  _memSession = withExpiry;
  // The auth token is the one field that lets someone impersonate this
  // shopkeeper — keep it in SecureStore (Android Keystore / iOS Keychain), not
  // plain AsyncStorage, which is trivially readable via filesystem access on a
  // rooted/jailbroken device or a device backup extraction. Everything else
  // (user id/name/role, expiry) is non-sensitive and stays in AsyncStorage.
  const { token, ...rest } = withExpiry;
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(rest)),
  ]);
}

export async function getSession(): Promise<UserSession | null> {
  if (_memSession) return _memSession;
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const rest = JSON.parse(raw) as Partial<UserSession>;

    let token: string | null = null;
    try {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      // SecureStore itself can throw (e.g. an invalidated Android Keystore key) —
      // fall through to the legacy-migration check below rather than crashing.
      token = null;
    }

    // One-time migration: installs from before this change have the token sitting
    // in the same AsyncStorage blob as the rest of the session. Move it to
    // SecureStore and rewrite the AsyncStorage entry without it.
    if (!token && rest.token) {
      token = rest.token;
      delete rest.token;
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(rest));
    }

    if (!token) {
      // Session metadata exists but the token is gone (cleared/never migrated) —
      // there's no usable session without it.
      await clearSession();
      return null;
    }

    const session: UserSession = { ...(rest as Omit<UserSession, 'token'>), token };

    if (session.expiresAt && Date.now() > session.expiresAt) {
      await clearSession();
      return null;
    }
    _memSession = session;
    return _memSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  _memSession = null;
  // Store list is cached independently of the session (in-memory + AsyncStorage,
  // shared across whoever's currently logged in) — without clearing it here, a
  // different shopkeeper logging in within the cache's TTL would see the
  // previous shopkeeper's stores until it naturally expired.
  clearStoreCache();
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    AsyncStorage.multiRemove([
      SESSION_KEY,
      "inventory_persisted_state",
      "inventory_products_cache",
    ]),
  ]);
}

/**
 * Call once on app start (before reading session).
 * On a genuine fresh install AsyncStorage is empty, so no install token exists
 * and no session exists — nothing to do.
 * On reinstall where Android preserved data, the old session could silently
 * carry over. We detect this by checking if an install token is present:
 * if missing (data was wiped) we clear any stale session; if present we leave it.
 */
export async function guardFreshInstall(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(INSTALL_TOKEN_KEY);
    if (!token) {
      // No install token → truly fresh data directory → wipe any stale session
      // (both the AsyncStorage metadata and the SecureStore token, if present —
      // SecureStore/Keychain data can outlive an app's own AsyncStorage wipe).
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
        AsyncStorage.multiRemove([SESSION_KEY, "inventory_persisted_state", "inventory_products_cache"]),
      ]);
      _memSession = null;
      // Write the install token so subsequent launches don't wipe again
      await AsyncStorage.setItem(INSTALL_TOKEN_KEY, "1");
    }
  } catch {
    // Non-fatal — if this fails the app still works
  }
}
