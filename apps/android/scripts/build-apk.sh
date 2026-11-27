#!/usr/bin/env bash
# Builds the Android APKs. Needs: Android SDK (ANDROID_HOME) with NDK 27.2 and CMake 3.22.1, JDK 17+.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"
NODE_MOBILE_VERSION=18.20.4

# 1. Node.js for Android (prebuilt by the nodejs-mobile project).
if [ ! -f app/libnode/bin/arm64-v8a/libnode.so ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/libnode.zip" "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_MOBILE_VERSION}/nodejs-mobile-v${NODE_MOBILE_VERSION}-android.zip"
  mkdir -p app/libnode && unzip -q -o "$tmp/libnode.zip" -d app/libnode && rm -rf "$tmp"
fi

# 2. The web app and the server bundle that runs on the phone.
(cd "$ROOT" && npm run build:android -w @marquee/web && npm run bundle:mobile -w @marquee/server)

# 3. The APKs.
echo "sdk.dir=${ANDROID_HOME:?set ANDROID_HOME}" > local.properties
gradle --no-daemon assembleRelease
ls -la app/build/outputs/apk/release/
