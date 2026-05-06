import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "nearandnow_session";

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
