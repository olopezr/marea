#!/usr/bin/env bash
# Compila el App Bundle (.aab) firmado para Google Play: scripts/release-android.sh
# Variables obligatorias: KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD (las lee android/app/build.gradle.kts).
# Opcional: JAVA_HOME (por defecto, el JDK 21 de Homebrew si existe).
set -euo pipefail

cd "$(dirname "$0")/../android"

fail() { echo "Error: $1" >&2; exit 1; }

: "${KEYSTORE_FILE:?Define KEYSTORE_FILE (ruta al .jks de release)}"
: "${KEYSTORE_PASSWORD:?Define KEYSTORE_PASSWORD}"
: "${KEY_ALIAS:?Define KEY_ALIAS}"
: "${KEY_PASSWORD:?Define KEY_PASSWORD}"
[ -f "$KEYSTORE_FILE" ] || fail "no existe el keystore: $KEYSTORE_FILE"

if [ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@21 ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi
command -v java >/dev/null || [ -x "${JAVA_HOME:-}/bin/java" ] || fail "no hay JDK 21 (brew install openjdk@21)"

if [ ! -f app/google-services.json ]; then
  echo "Aviso: falta android/app/google-services.json; el bundle se compila sin notificaciones push." >&2
fi

./gradlew --no-daemon clean bundleRelease

AAB=app/build/outputs/bundle/release/app-release.aab
[ -f "$AAB" ] || fail "no se generó $AAB"
jarsigner -verify "$AAB" >/dev/null || fail "el bundle no está firmado correctamente"
echo
echo "Listo: $(pwd)/$AAB"
shasum -a 256 "$AAB"
