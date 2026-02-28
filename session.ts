// lib/session.ts
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

export async function saveSession(session: UserSession) {
  console.log("[session] Saving session:", {
    hasToken: !!session.token,
    userId: session.user?.id,
    userName: session.user?.name,
    userRole: session.user?.role,
  });
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  console.log("[session] ✅ Session saved to AsyncStorage");
}

export async function getSession(): Promise<UserSession | null> {
  console.log("[session] Getting session from AsyncStorage...");
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    console.log("[session] No session found in AsyncStorage");
    return null;
  }
  try {
    const session = JSON.parse(raw) as UserSession;
    console.log("[session] ✅ Session found:", {
      hasToken: !!session.token,
      userId: session.user?.id,
      userRole: session.user?.role,
    });
    return session;
  } catch (err) {
    console.error("[session] ❌ Failed to parse session:", err);
    return null;
  }
}

export async function clearSession() {
  console.log("[session] Clearing session...");
  await AsyncStorage.removeItem(SESSION_KEY);
  // Also clear inventory cache to prevent cross-user contamination
  await AsyncStorage.removeItem("inventory_persisted_state");
  await AsyncStorage.removeItem("inventory_products_cache");
  console.log("[session] ✅ Session and inventory cache cleared");
}
