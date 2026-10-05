// index.js or index.ts
// Background push task + Notifee background events: must be registered in
// the global scope before the app entry (see lib/backgroundNotifications.ts).
import "./lib/backgroundNotifications";
import "expo-router/entry";
