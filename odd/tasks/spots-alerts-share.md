# Feature: spot coordinates, per-spot alerts, improvement alerts, share card, new spots

Branch: `feat/spots-alerts-share` (from `feat/aemet-push-alerts`). One commit per work unit.

## Objective

Deliver improvements A1, B5, B6, D9 and D10 of the improvement plan.

## Scope and decisions

- **A2 (reduced-forecast notice): no work needed.** Web, iOS and Android already show a bilingual banner when `forecastSource === "portus"` (3-day forecast), with tests. The earlier claim that users were not told was wrong.
- **A1:** spots whose coordinate lies more than 150 m from the sand of their own named beach (OpenStreetMap `natural=beach`) are moved onto the sand edge. Facing is unchanged. Reef spots and OSM naming variants are left alone.
- **B5:** per-spot alert preferences (minimum quality, offshore wind only, allowed hours). Server is backwards compatible: old clients keep the global threshold. Web UI is built; iOS and Android UI are not part of this unit.
- **B6:** an alert when the rating level for a day improves after an alert for that day was already sent (e.g. good -> very good). No new snapshot table: levels sent are recorded in `sent`.
- **D9:** share card rendered client-side on a canvas (no new dependency) and shared with the Web Share API, or downloaded. Native apps keep their current link sharing.
- **D10:** new spots in Portugal and France, positioned on the sand with the same OSM check. Spain-only sources (AEMET, IHM tides, Puertos del Estado buoys) must not attribute data to a far-away place.

## Tasks

- [x] T1 (A1) move offshore spots onto the sand; sync native spots.json and landing; refresh buoy-sight if the script runs
- [ ] T2 (D10) add Portuguese and French spots, verified on OSM; copy updated
- [x] T3 (B5) per-spot alert preferences: DB, API, web UI, tests
- [x] T4 (B6) improvement alerts, tests
- [x] T5 (D9) share card on the web, tests where runnable

## Route

Inline: context already held in this session; each task closes with its own commit. Test-first where a runnable deterministic test exists.

## Evidence

- T1: 10 spots moved onto the sand (lanzada, razo, orzan, bastiagueiro, carnota, oyambre, orinon, laarena, barrosa, lances). Re-checked against OpenStreetMap: all now 3-14 m from their named beach (were 189-439 m). 100/100 tests; native spots.json and landing synced. buoy-sight.json not regenerated for these (moves <=440 m on an 8 km line); it will be regenerated once in T2 for the new spots.
- T3: RED 5/5 (test/push-prefs.test.js) then GREEN. Server: alerts table gets min_score/offshore/from_h/to_h (migrated in place), `prefs` accepted by subscribe and returned by status, preserved when an old client omits it, applied in checkAlerts and checkWarnings. Web UI verified in headless Edge with a simulated push subscription: change quality, offshore and hours -> persisted on the server, block stays open after redraw, no console errors. Old status tests updated for the new `prefs` field; Android (`ignoreUnknownKeys`) and iOS (Codable) tolerate it. iOS and Android screens for per-spot settings are not built.
- T4: RED then GREEN (test/push-improve.test.js, 5 tests). Level reached per day is stored in `sent` as `lvl:<day>:<n>`; an improvement alert is sent only when the level rises above every level already alerted that day and the user's per-spot rules still pass; same notification tag as the original alert so it replaces it on the phone. A day alerted before this change is taken as a silent baseline (no false improvement on deploy). Worsening never alerts.
- T5: `public/js/sharecard.js` (pure `cardModel` + `fitSize` tested in test/sharecard.test.js; canvas drawing is browser-only). The card is pre-rendered when a spot opens and shared with `navigator.share({files})` where `canShare` allows it; otherwise the previous text/link sharing runs. Verified in headless Edge with `navigator.share` stubbed: a 1080x1350 PNG (~300 KB) is produced for Somo and for a long name (Nazaré (Praia do Norte)); no console errors. The model tests were written after the module (not strict test-first); the drawing itself has no automated test. Native apps keep link sharing.
