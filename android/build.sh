#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fotify Android Client — build script
#
# Produces fotify-client.apk (signed with the debug key, ready for sideloading)
#
# Usage:
#   cd android && ./build.sh
#
# Requirements:
#   • Android SDK (auto-detected at ~/Library/Android/sdk or $ANDROID_HOME)
#   • Java 17+ (tested with OpenJDK 17/21)
#   • gradle in $PATH  (for first-run wrapper generation)
#   • Internet access  (Gradle and Maven dependencies downloaded on first run)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Locate Android SDK ────────────────────────────────────────────────────
if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -d "$HOME/Library/Android/sdk" ]]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [[ -d "$HOME/Android/Sdk" ]]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    else
        echo "ERROR: Android SDK not found."
        echo "  Set ANDROID_HOME or install Android Studio."
        exit 1
    fi
fi
echo "Using Android SDK: $ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools/bin:$PATH"

# ── 2. Write local.properties (required by AGP) ──────────────────────────────
echo "sdk.dir=$ANDROID_HOME" > local.properties

# ── 3. Bootstrap Gradle wrapper (only on first run) ──────────────────────────
if [[ ! -f "gradle/wrapper/gradle-wrapper.jar" ]]; then
    echo "Generating Gradle wrapper (Gradle 8.7)…"
    if ! command -v gradle &>/dev/null; then
        echo "ERROR: 'gradle' not found in PATH."
        echo "  Install Gradle or run: brew install gradle"
        exit 1
    fi
    gradle wrapper --gradle-version=8.7 --distribution-type=bin --quiet
    echo "Gradle wrapper generated."
fi
chmod +x gradlew

# ── 4. Build the APK ─────────────────────────────────────────────────────────
echo ""
echo "Building Fotify Client APK…"
./gradlew assembleRelease \
    --warning-mode=none \
    --console=plain \
    -Dorg.gradle.jvmargs="-Xmx2g"

# ── 5. Copy APK to project root ──────────────────────────────────────────────
APK_SRC="app/build/outputs/apk/release/app-release.apk"
APK_DST="$SCRIPT_DIR/fotify-client.apk"

if [[ -f "$APK_SRC" ]]; then
    cp "$APK_SRC" "$APK_DST"
    SIZE=$(du -sh "$APK_DST" | cut -f1)
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  Build successful!                               ║"
    echo "╠══════════════════════════════════════════════════╣"
    echo "║  APK : $APK_DST"
    echo "║  Size: $SIZE"
    echo "╠══════════════════════════════════════════════════╣"
    echo "║  Install via ADB:                                ║"
    echo "║    adb install -r fotify-client.apk              ║"
    echo "╚══════════════════════════════════════════════════╝"
else
    echo "ERROR: APK not found at $APK_SRC"
    exit 1
fi
