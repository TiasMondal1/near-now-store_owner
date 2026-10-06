// @expo/config-plugins pulls in an ES-module-only dependency (uuid) this Jest
// setup cannot load; the function under test only needs withAndroidManifest.
jest.mock("@expo/config-plugins", () => ({ withAndroidManifest: (config: unknown) => config }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { removeAudioForegroundServices } = require("../plugins/withoutAudioForegroundServices");

const manifest = () => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    "uses-permission": [
      { $: { "android:name": "android.permission.INTERNET" } },
      { $: { "android:name": "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" } },
    ],
    application: [{ $: { "android:name": ".MainApplication" }, service: [{ $: { "android:name": "app.notifee.core.ForegroundService" } }] }],
  },
});

describe("withoutAudioForegroundServices", () => {
  it("marks expo-audio's services and the media-playback permission for removal, once", () => {
    const m = removeAudioForegroundServices(removeAudioForegroundServices(manifest()));
    const perms = m.manifest["uses-permission"];
    const media = perms.filter((p: any) => p.$["android:name"] === "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");
    expect(media).toEqual([{ $: { "android:name": "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK", "tools:node": "remove" } }]);
    expect(perms.some((p: any) => p.$["android:name"] === "android.permission.INTERNET" && !p.$["tools:node"])).toBe(true);

    const services = m.manifest.application[0].service;
    for (const name of ["expo.modules.audio.service.AudioControlsService", "expo.modules.audio.service.AudioRecordingService"]) {
      expect(services.filter((s: any) => s.$["android:name"] === name)).toEqual([{ $: { "android:name": name, "tools:node": "remove" } }]);
    }
    // Notifee's special-use service (the order listener) is untouched.
    expect(services.find((s: any) => s.$["android:name"] === "app.notifee.core.ForegroundService").$["tools:node"]).toBeUndefined();
    expect(m.manifest.$["xmlns:tools"]).toBe("http://schemas.android.com/tools");
  });
});
