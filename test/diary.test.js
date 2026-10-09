import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as diary from "../public/js/diary.js";

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
});

const snap = (h, Tp, wind, windDir) => ({
  h,
  Tp,
  dir: 300,
  water: 17,
  wind,
  windDir,
  gust: wind + 5,
  tide: null,
  score: 3,
});

test("add guarda la sesión y la devuelve normalizada", () => {
  const e = diary.add({ spotId: "somo", date: "2026-10-09", rating: 4, notes: "  buen día  ", snap: null });
  assert.match(e.id, /./);
  assert.equal(e.notes, "buen día");
  assert.equal(diary.load().length, 1);
  assert.equal(JSON.parse(store.get("marea:diary"))[0].spotId, "somo");
});

test("add acota la nota a 500 caracteres y la nota a 1..5", () => {
  const e = diary.add({ spotId: "somo", date: "2026-10-09", rating: 9, notes: "x".repeat(900) });
  assert.equal(e.notes.length, 500);
  assert.equal(e.rating, 5);
  assert.equal(diary.add({ spotId: "somo", date: "2026-10-09", rating: 0 }).rating, 1);
});

test("add rechaza fechas o spots no válidos", () => {
  assert.equal(diary.add({ spotId: "", date: "2026-10-09", rating: 3 }), null);
  assert.equal(diary.add({ spotId: "somo", date: "09/10/2026", rating: 3 }), null);
  assert.equal(diary.load().length, 0);
});

test("remove borra solo la sesión indicada", () => {
  const a = diary.add({ spotId: "somo", date: "2026-10-01", rating: 3 });
  const b = diary.add({ spotId: "somo", date: "2026-10-02", rating: 3 });
  diary.remove(a.id);
  assert.deepEqual(
    diary.load().map((x) => x.id),
    [b.id],
  );
});

test("el diario conserva como máximo 500 sesiones y descarta las más antiguas", () => {
  for (let i = 0; i < 503; i++) diary.add({ spotId: "somo", date: "2026-10-09", rating: 3, notes: String(i) });
  const all = diary.load();
  assert.equal(all.length, 500);
  assert.equal(all[0].notes, "3");
  assert.equal(all.at(-1).notes, "502");
});

test("load tolera JSON corrupto o con formato inesperado", () => {
  store.set("marea:diary", "{no es json");
  assert.deepEqual(diary.load(), []);
  store.set("marea:diary", JSON.stringify({ a: 1 }));
  assert.deepEqual(diary.load(), []);
  store.set(
    "marea:diary",
    JSON.stringify([{ foo: 1 }, null, { id: "a", spotId: "somo", date: "2026-10-09", rating: 4 }]),
  );
  assert.equal(diary.load().length, 1);
});

test("sin localStorage no lanza", () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error("bloqueado");
    },
    setItem() {
      throw new Error("bloqueado");
    },
  };
  assert.deepEqual(diary.load(), []);
  assert.doesNotThrow(() => diary.add({ spotId: "somo", date: "2026-10-09", rating: 3 }));
});

test("listNewestFirst ordena por fecha y luego por orden de alta", () => {
  const a = diary.add({ spotId: "somo", date: "2026-10-01", rating: 3 });
  const b = diary.add({ spotId: "somo", date: "2026-10-05", rating: 3 });
  const c = diary.add({ spotId: "somo", date: "2026-10-05", rating: 3 });
  assert.deepEqual(
    diary.listNewestFirst().map((x) => x.id),
    [c.id, b.id, a.id],
  );
});

test("insights exige al menos 2 sesiones de 4-5 en ese spot", () => {
  const e = (spotId, rating, s) => ({ id: Math.random(), spotId, date: "2026-10-01", rating, snap: s });
  const list = [
    e("somo", 5, snap(1.5, 10, 6, 90)),
    e("somo", 3, snap(0.5, 6, 20, 270)),
    e("laida", 4, snap(2, 12, 5, 90)),
  ];
  assert.equal(diary.insights(list, "somo"), null);
  list.push(e("somo", 4, snap(2.5, 12, 10, 90)));
  const i = diary.insights(list, "somo");
  assert.equal(i.count, 2);
  assert.deepEqual(i.h, { avg: 2, min: 1.5, max: 2.5 });
  assert.deepEqual(i.Tp, { avg: 11, min: 10, max: 12 });
  assert.deepEqual(i.wind, { avg: 8, min: 6, max: 10 });
  assert.equal(i.windDir, "E");
});

test("insights ignora sesiones sin instantánea", () => {
  const e = (s) => ({ id: Math.random(), spotId: "somo", date: "2026-10-01", rating: 5, snap: s });
  assert.equal(diary.insights([e(null), e(snap(1, 8, 5, 90))], "somo"), null);
});

test("buildSnap usa la boya y el viento medido si existen", () => {
  const s = {
    score: 3.2,
    now: { h: 1, T: 8, dir: 280, water: 16, wind: 12, windDir: 200, gust: 18 },
    buoy: { h: 1.4, Tp: 11, dir: 300, water: 17.5 },
    meteo: { wind: { wind: 7, windDir: 90, gust: 11 } },
    tide: { h: 2.1, rising: true, coef: 80 },
  };
  assert.deepEqual(diary.buildSnap(s), {
    h: 1.4,
    Tp: 11,
    dir: 300,
    water: 17.5,
    wind: 7,
    windDir: 90,
    gust: 11,
    tide: { h: 2.1, rising: true, coef: 80 },
    score: 3.2,
  });
});

test("buildSnap cae a la previsión sin boya ni estación", () => {
  const s = { score: 2, now: { h: 1, T: 8, dir: 280, water: 16, wind: 12, windDir: 200, gust: 18 }, tide: {} };
  const b = diary.buildSnap(s);
  assert.equal(b.h, 1);
  assert.equal(b.Tp, 8);
  assert.equal(b.wind, 12);
  assert.equal(b.tide, null);
});

test("snapFor solo devuelve datos si la fecha es hoy", () => {
  const s = { score: 2, now: { h: 1, T: 8, wind: 3 }, tide: {} };
  const now = new Date(2026, 9, 10, 12).getTime();
  assert.equal(diary.snapFor(s, "2026-10-09", now), null);
  assert.equal(diary.snapFor(s, "2026-10-10", now).h, 1);
  assert.equal(diary.todayISO(now), "2026-10-10");
});
