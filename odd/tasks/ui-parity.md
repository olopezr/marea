# UI parity across web, iOS and Android

Branch: `feat/ui-parity` (from `main` at e8fd739).

## Objective

The three clients share the same interface: same panels, same default collapsed/expanded state, same order. Reference platform: iOS (it sits between the web and Android).

## Reference spot-detail order (iOS)

banners, AEMET warnings, hero, actions (alerts + webcam), buoy, history ("Boya frente a previsión"), tiles, tide, hours, week, glossary, location, diary, "updated" line, footer.

## Differences to fix (from the parity audit)

1. History panel (`hist.title`): web is always open; iOS and Android are collapsible and closed by default. Make the web collapsible and closed by default.
2. Android has no AEMET warning UI (detail banner and list-card badge) although the server sends `warning` and `warning_aemet*` strings exist. Add both, mirroring web and iOS.
3. Order: Android puts history after the tide chart (move it right after buoy); web puts diary before glossary and location (move it after location).

## Out of scope (intentional platform differences)

Native maps, native rule controls (inputs / steppers / sliders), permission copy, legal links opening mode, PWA-only install states, cosmetic footer layout.

## Constraints

- No server changes. Strings through `i18n/strings.json` + `node scripts/i18n.mjs`.
- Web: bump `VERSION` in `public/sw.js` when `app.js`/CSS change (service worker cache).
- Planning heuristic only: about 400 changed lines per task.

## Tasks

- [x] T1 Web (149 tests; collapsed state seen in headless screenshot, expanded/chevron not seen): collapsible history panel closed by default (state survives the 10-minute refresh), diary panel after location. Route: delegated writer (2+ non-trivial files).
- [x] T2 Android (build, 6 new unit tests and lint green; banner and badge seen on the marea AVD with a real yellow AEMET warning; multi-warning, red/orange, dark mode not seen): AEMET warning banner on the detail and badge on list cards, history panel right after buoy. Route: delegated writer.
- [x] T3 Final check (web order read against iOS; npm test 149, lint, prettier, Android build/tests/lint green): web order and default states re-read against iOS; npm check, Android build/tests/lint, iOS untouched.

## Acceptance criteria

- On all three platforms the spot detail shows the same panels in the reference order, with the history panel collapsed by default.
- An active AEMET warning appears on Android in the detail and on the list card like on web and iOS.

## Checks

`npm test && npm run lint && npm run format:check`; `cd android && ./gradlew assembleDebug testDebugUnitTest lintDebug`.
