#!/usr/bin/env bash
# Comprobación previa a publicar en las tiendas: scripts/release-check.sh [android|ios|all]
# Dice qué falta (✗ bloquea, ! conviene revisar, ✓ listo). No cambia nada ni sube nada.
# Solo usa utilidades de macOS y de bash; no necesita herramientas extra.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
BLOCKERS=0
WARNINGS=0

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; BLOCKERS=$((BLOCKERS + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }
# Contenido de un archivo sin depender de cat/grep.
read_file() { [ -f "$1" ] && printf '%s' "$(<"$1")" || printf ''; }

# ---------- Común ----------
common() {
  section "Común"
  local total=0 f text stripped
  for f in "$ROOT"/public/legal/*.html; do
    text="$(read_file "$f")"
    stripped="${text//<mark>\[/}"
    total=$((total + (${#text} - ${#stripped}) / 7)) # "<mark>[" son 7 caracteres
  done
  if [ "$total" -eq 0 ]; then
    ok "Páginas legales sin campos pendientes"
  else
    bad "Páginas legales con $total campo(s) sin rellenar ([NOMBRE], [NIF], [EMAIL DE CONTACTO]…)"
  fi

  local branch dirty
  branch="$(git -C "$ROOT" branch --show-current 2>/dev/null)"
  dirty="$(git -C "$ROOT" status --porcelain --untracked-files=no 2>/dev/null)"
  if [ "$branch" = "main" ]; then ok "En la rama main"; else warn "Estás en '$branch', no en main"; fi
  if [ -z "$dirty" ]; then ok "Sin cambios sin confirmar en archivos versionados"; else warn "Hay cambios sin confirmar"; fi

  warn "No verificable desde aquí (revísalo en Render): VAPID_*, VAPID_SUBJECT, APNS_*, FCM_SERVICE_ACCOUNT, OPEN_METEO_PROXY_SECRET"
}

# ---------- Android ----------
android() {
  section "Android (Google Play)"
  local gradle props
  gradle="$(read_file "$ROOT/android/app/build.gradle.kts")"
  props="$(read_file "$ROOT/android/gradle.properties")"
  [[ "$gradle" =~ versionName\ =\ \"([^\"]+)\" ]] && ok "Versión ${BASH_REMATCH[1]}"
  [[ "$gradle" =~ versionCode\ =\ ([0-9]+) ]] && ok "versionCode ${BASH_REMATCH[1]} (súbelo en cada subida a Play)"
  if [[ "$props" =~ mareaApiBaseRelease=https:// ]]; then ok "La app de release usa un servidor HTTPS"; else bad "mareaApiBaseRelease no es una URL HTTPS"; fi

  if has java || [ -x "${JAVA_HOME:-}/bin/java" ] || [ -d /opt/homebrew/opt/openjdk@21 ]; then ok "JDK disponible"; else bad "Falta JDK 21 (brew install openjdk@21)"; fi
  local localprops
  localprops="$(read_file "$ROOT/android/local.properties")"
  if [[ "$localprops" =~ sdk\.dir=(.+) ]] && [ -d "${BASH_REMATCH[1]}" ]; then ok "Android SDK encontrado"; else bad "No se encuentra el Android SDK (android/local.properties)"; fi

  if [ -n "${KEYSTORE_FILE:-}" ] && [ -f "${KEYSTORE_FILE:-}" ]; then ok "Keystore de release: $KEYSTORE_FILE"; else bad "Falta el keystore de release (define KEYSTORE_FILE; créalo con keytool y guarda copia de seguridad)"; fi
  if [ -n "${KEYSTORE_PASSWORD:-}" ] && [ -n "${KEY_ALIAS:-}" ] && [ -n "${KEY_PASSWORD:-}" ]; then ok "KEYSTORE_PASSWORD, KEY_ALIAS y KEY_PASSWORD definidos"; else bad "Faltan KEYSTORE_PASSWORD, KEY_ALIAS o KEY_PASSWORD"; fi
  if [ -f "$ROOT/android/app/google-services.json" ]; then ok "google-services.json presente (avisos push)"; else warn "Falta android/app/google-services.json: la app se compila, pero sin avisos push"; fi
  if [ -n "${SUPPLY_JSON_KEY:-}" ] && [ -f "${SUPPLY_JSON_KEY:-}" ]; then ok "Clave de cuenta de servicio de Play (SUPPLY_JSON_KEY)"; else warn "Sin SUPPLY_JSON_KEY: tendrás que subir el .aab a mano en Play Console"; fi
}

# ---------- iOS ----------
ios() {
  section "iOS (TestFlight y App Store)"
  local yml ent
  yml="$(read_file "$ROOT/ios/project.yml")"
  ent="$(read_file "$ROOT/ios/Marea/App/Marea.entitlements")"
  [[ "$yml" =~ MARKETING_VERSION:\ \"([^\"]+)\" ]] && ok "Versión ${BASH_REMATCH[1]}"
  [[ "$yml" =~ CURRENT_PROJECT_VERSION:\ \"([0-9]+)\" ]] && ok "Build ${BASH_REMATCH[1]} (súbela en cada subida a TestFlight)"
  if [[ "$yml" =~ DEVELOPMENT_TEAM:\ \"([A-Z0-9]{10})\" ]]; then ok "Equipo de desarrollo ${BASH_REMATCH[1]}"; else bad "DEVELOPMENT_TEAM sin definir en ios/project.yml"; fi
  if [[ "$yml" == *'MAREA_API_BASE: "https://'* ]]; then ok "Release usa un servidor HTTPS"; else bad "MAREA_API_BASE de release no es HTTPS"; fi
  if [[ "$ent" == *aps-environment* ]]; then ok "Marea.entitlements incluye notificaciones push"; else bad "Marea.entitlements sin aps-environment"; fi

  if has xcodebuild; then ok "Xcode instalado"; else bad "Falta Xcode"; fi
  if has xcodegen; then ok "xcodegen instalado"; else bad "Falta xcodegen (brew install xcodegen)"; fi

  local ids teams
  ids="$(security find-identity -v -p codesigning 2>/dev/null)"
  if [[ "$ids" == *"Apple Distribution"* || "$ids" == *"iPhone Distribution"* ]]; then ok "Certificado de distribución en el llavero"; else bad "Sin certificado de distribución de Apple (necesitas cuenta de pago y que Xcode lo cree)"; fi
  teams="$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null)"
  if [ -n "$teams" ]; then ok "Hay una cuenta de Apple en Xcode"; else bad "Xcode no tiene ninguna cuenta de Apple (Ajustes → Cuentas): sin ella no puede firmar con push ni subir"; fi
  warn "No verificable desde aquí: App ID con Push Notifications y clave APNs .p8 en developer.apple.com; app creada en App Store Connect"
}

case "$TARGET" in
  android) common; android ;;
  ios) common; ios ;;
  all) common; android; ios ;;
  *) echo "Uso: $0 [android|ios|all]" >&2; exit 2 ;;
esac

section "Resumen"
printf '  %d bloqueante(s), %d aviso(s)\n' "$BLOCKERS" "$WARNINGS"
[ "$BLOCKERS" -eq 0 ]
