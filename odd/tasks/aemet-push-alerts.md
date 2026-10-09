# Feature: AEMET warning push alerts

## Objective

Send a push notification when AEMET publishes a yellow, orange or red warning (active now or starting within 24 h) that affects a spot where the user has alerts enabled.

## Scope and decisions

- All levels (amarillo, naranja, rojo) and all phenomena, same zone matching as the in-app banner.
- Independent of the quality threshold (min_score): a safety warning must not depend on how good the surf looks.
- One notification per warning and device. Dedup key: phenomenon + zone + level + start day, stored in the existing `sent` table (`day` = `w:...`). Escalation (yellow -> orange) changes the key and notifies again.
- Same quiet hours as forecast alerts (07:00-22:00 spot time); at most one warning notification per spot per run.
- Runs before the forecast check so a forecast outage never blocks warnings. AEMET failure returns [] (no false alerts).
- Web, iOS and Android need no client change: payload is the same title/body/url.

## Tasks

- [x] T1 aemet.js: `alertableWarnings(spot, all, now)` (level, active or imminent, not expired)
- [x] T2 push.js: `checkWarnings`, message es/en, wired at start of `checkAlerts`
- [x] T3 tests (separate file, own data dir, relative dates) + fixture hook for custom RSS
- [x] T4 alerts screen copy mentions warnings (i18n source + sync)
- [x] T5 filter by phenomenon: coastal/wind/thunderstorm family at any level, other phenomena only orange/red (push only; banner unchanged)
- [x] T6 AEMET feed: a non-RSS reply (e.g. WAF "Request Rejected" with HTTP 200) is a failure, counted in sourceErrors.aemet, never cached as an empty feed

## Decisions (user-approved)

- T5/T6 added after a side note: yellow heat/rain/fog warnings would flood users. AEMET feed was unreachable from the dev machine (WAF), so real frequency is unmeasured.

## Route

Inline. Context already held (files read in this session); delegating would re-derive it. Test-first: runnable node:test suite exists, RED observed before implementation.

## Evidence

- RED: 7 of 8 new tests failed before implementation (the 8th is the negative case).
- GREEN: `npm test` 96/96 (88 existing + 8 new in test/push-warnings.test.js); eslint clean; prettier clean on tracked files.
- i18n sources regenerated (web, iOS, Android) with `node scripts/i18n.mjs`; sw.js VERSION bumped.
- T5/T6: RED 4 new tests, then GREEN: `npm test` 100/100, eslint clean.
- Not verified: real delivery to a device (needs deployed server + AEMET live warning); native apps need no client change.
