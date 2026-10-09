# Feature: native per-spot alert settings and share card (iOS and Android)

Branch: `feat/native-alerts-share` (from `feat/spots-alerts-share`). One commit per work unit.

## Objective

Bring to the iOS and Android apps what the web already has: per-spot alert settings (B5) and the share card (D9).

## Scope and decisions

- Same server API as the web: `prefs` per spot (`min`, `offshore`, `from`, `to`) in subscribe and status. The apps keep working with servers that do not return `prefs`.
- iOS: SwiftUI disclosure per active spot; share sheet with the card image rendered by `ImageRenderer`.
- Android: Compose expandable row per active spot; card drawn on a `Canvas` bitmap and shared through a `FileProvider`.
- Card layout follows `public/js/sharecard.js` (1080x1350, same fields, same strings).
- Verification: compile both apps, unit tests for model decoding/encoding and card text, and visual check where a simulator or emulator is available. A real device is not available for Android.

## Tasks

- [x] T1 iOS: models, API client and `AlertsModel` carry `prefs`; unit tests
- [x] T2 iOS: per-spot settings in the alerts screen
- [x] T3 iOS: share card (image + text) from the spot screen
- [x] T4 Android: models, API client and `AlertsModel` carry `prefs`; unit tests
- [x] T5 Android: per-spot settings in the alerts screen
- [x] T6 Android: share card (image + text) from the spot screen

## Route

Inline: context already held; each task closes with its own commit.

## Evidence

(filled per task)

- T1/T2 (iOS): `AlertPref` + `AlertState.prefs` (decodes servers without `prefs`), `APIClient.subscribe(... prefs:)`, `AlertsModel.save/setPref`, `SpotPrefs` disclosure per active spot in `AlertsView` (quality menu, offshore toggle, from/to menus, dot when customised, start>=end rejected with a toast). 4 new tests in `AlertsTests` (decode with/without prefs, normalisation, encoding); full iOS suite 19/19 on the iPhone 18 Pro simulator; app builds. **Not verified visually**: the screen needs a push token and the Debug build points at production, so it was not driven in a simulator.
- T3 (iOS): `ShareCardModel.make` (same fields and strings as the web card) + `ShareCardView` (SwiftUI, always dark, 1080x1350) + `ShareCard.image` (`ImageRenderer`, scale 1). `ShareButton(card:)` renders it on tap and `SharePresenter` adds the image next to the text and link in the share sheet. 2 new tests (model texts from the `somo` fixture; image is 1080x1350); full iOS suite 21/21. The PNG was dumped and inspected (first render squeezed the stats; spacing tightened). The share sheet itself was not driven on a device.
- T4 (Android): `AlertPref` (+ `isDefault`, `normalized`) and `AlertState.prefs` (default empty, so servers without `prefs` decode), `Api.subscribe(... prefs)`, `AlertsModel.save/setPref`. 4 new unit tests in `AlertsTest`; Android unit suite 17/17 (checked in the test-results XML).
- T5 (Android): `SpotPrefs` row under each active spot in `AlertsScreen` (collapsible; quality menu, offshore switch, from/to menus; dot when customised; start>=end rejected with a toast) plus a small `Menu` composable. `assembleDebug`, `testDebugUnitTest` and `lintDebug` pass. **Verified on the `marea` emulator** against a local server (Debug build with `-PmareaApiBaseDebug=http://10.0.2.2:8099`, because port 8080 is held by an unrelated `gvproxy`): enabled a spot, opened its settings, chose Very good and offshore-only; the server stored `min_score=4, offshore=1` for that spot and the screen showed the dot and the "Settings saved" toast.
- T6 (Android): `ShareCard` (pure `model` + `fitSize`, `render` on a `Canvas` with the app fonts, `save` through a `FileProvider` declared in the manifest with `res/xml/file_paths.xml`); the share button sends the PNG plus text and link, and falls back to text only if the card fails. 2 new unit tests (model texts, `fitSize`); Android suite 19/19, `assembleDebug` and `lintDebug` pass. **Verified on the `marea` emulator**: the system share sheet opens as "Sharing image" with the card thumbnail and the text, and the generated PNG is 1080x1350 with the same layout as the web card.
- Incident: the first emulator attached to adb was the `nutripet` AVD (another project), so Marea was installed there and some taps and an intent were sent to it before I noticed NutriPet in the foreground. The last tap landed on an empty part of its top bar. Everything after that was done on the `marea` AVD (`emulator-5556`) with `-s`.
