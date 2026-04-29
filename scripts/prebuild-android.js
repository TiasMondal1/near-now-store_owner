#!/usr/bin/env node
/**
 * Expo prebuild wrapper that tries to reduce Windows `EBUSY` lock issues by:
 *  1) stopping any running Gradle daemons
 *  2) (lightly) removing common Gradle lock files
 *  3) running `expo prebuild --platform android --clean`
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const androidDir = path.join(rootDir, "android");
const isWin = process.platform === "win32";

const stopGradleDaemons = () => {
  const gradleWrapper = isWin ? "gradlew.bat" : "gradlew";
  const gradle = path.join(androidDir, gradleWrapper);
  if (!fs.existsSync(gradle)) return;

  if (isWin) {
    // On Windows, run via cmd.exe to avoid spawn issues with .bat
    spawnSync("cmd.exe", ["/c", gradle, "--stop"], {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    });
  } else {
    spawnSync(gradle, ["--stop"], {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    });
  }
};

const unlinkIfExists = (p) => {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // Ignore (Windows may still have a lock). Expo/Gradle will re-create if needed.
  }
};

const removeCommonGradleLocks = () => {
  const lockPaths = [
    path.join(androidDir, ".gradle", "buildOutputCleanup", "buildOutputCleanup.lock"),
    path.join(androidDir, ".gradle", "checksums", "checksums.lock"),
    path.join(androidDir, ".gradle", "fileHashes", "fileHashes.lock"),
  ];

  // One retry window tends to help after `gradlew --stop`.
  for (let i = 0; i < 2; i++) {
    lockPaths.forEach(unlinkIfExists);
    if (i === 0) {
      // Small delay (busy-wait for simplicity; 500ms is short).
      const until = Date.now() + 500;
      while (Date.now() < until) {
        // noop
      }
    }
  }
};

const runExpoPrebuild = () => {
  if (isWin) {
    // Using cmd.exe ensures Windows resolves `npx` / `.cmd` properly.
    return spawnSync(
      "cmd.exe",
      ["/c", "npx", "expo", "prebuild", "--platform", "android", "--clean"],
      {
        cwd: rootDir,
        stdio: "inherit",
        env: process.env,
      }
    );
  }

  return spawnSync("npx", ["expo", "prebuild", "--platform", "android", "--clean"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
};

stopGradleDaemons();
removeCommonGradleLocks();
const result = runExpoPrebuild();

process.exit(result.status ?? 1);

