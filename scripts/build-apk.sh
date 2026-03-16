#!/usr/bin/env bash
# Build release APK. Uses Java 17 if available to avoid JDK 22+ "restricted method" CMake errors.
set -e
cd "$(dirname "$0")/.."

# Prefer Java 17 for Android build (avoids "restricted method in java.lang.System" on JDK 22+)
if [ "$(uname)" = "Darwin" ] && command -v /usr/libexec/java_home &>/dev/null; then
  for v in 17 21 11; do
    JAVA_HOME_CANDIDATE=$(/usr/libexec/java_home -v "$v" 2>/dev/null) && break
  done
  if [ -n "$JAVA_HOME_CANDIDATE" ]; then
    export JAVA_HOME="$JAVA_HOME_CANDIDATE"
    echo "Using JAVA_HOME=$JAVA_HOME"
  fi
fi

# Ensure Gradle daemon picks up jvmargs (stop old daemons)
cd android && ./gradlew --stop 2>/dev/null || true
./gradlew assembleRelease "$@"
