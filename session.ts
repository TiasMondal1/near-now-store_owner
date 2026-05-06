import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "nearandnow_session";
const INSTALL_TOKEN_KEY = "nearandnow_install_token";

export type UserSession = {
  token: string;
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
// without relying on AsyncStorage flush timing (which is async on Android).
let _memSession: UserSession | null = null;

/** True when a session was saved in this JS runtime (i.e. user just logged in). */
export function isJustLoggedIn(): boolean {
  return _memSession !== null;
}

export async function saveSession(session: UserSession) {
  _memSession = session;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<UserSession | null> {
  if (_memSession) return _memSession;
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    _memSession = JSON.parse(raw) as UserSession;
    return _memSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  _memSession = null;
  await AsyncStorage.multiRemove([
    SESSION_KEY,
    "inventory_persisted_state",
    "inventory_products_cache",
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
      await AsyncStorage.multiRemove([SESSION_KEY, "inventory_persisted_state", "inventory_products_cache"]);
      _memSession = null;
      // Write the install token so subsequent launches don't wipe again
      await AsyncStorage.setItem(INSTALL_TOKEN_KEY, "1");
    }
  } catch {
    // Non-fatal — if this fails the app still works
  }
}
