import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

installFetch();

const aemet = await import("../server/sources/aemet.js");
const { overview, detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AEMET - Avisos</title>
    <item>
      <title>Aviso. Nivel naranja. Costeros. Menorca</title>
      <description>Aviso de costeros de nivel naranja de 00:00 09-10-2026 CEST (UTC+2) a 14:59 09-10-2026 CEST (UTC+2).</description>
      <link>https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/test_menorca.xml</link>
      <guid>test_menorca.xml</guid>
    </item>
    <item>
      <title>Aviso. Nivel amarillo. Lluvias. Pirineo de Lleida</title>
      <description>Aviso de precipitación acumulada de 12:00 08-10-2026 CEST (UTC+2) a 23:59 08-10-2026 CEST (UTC+2).</description>
      <link>https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/test_lleida.xml</link>
      <guid>test_lleida.xml</guid>
    </item>
    <item>
      <title>Aviso. Nivel amarillo. Tormentas. Litoral cántabro</title>
      <description>Aviso de tormentas de nivel amarillo de 10:00 07-10-2026 CEST (UTC+2) a 20:00 07-10-2026 CEST (UTC+2).</description>
      <link>https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/test_cantabria.xml</link>
      <guid>test_cantabria.xml</guid>
    </item>
  </channel>
</rss>`;

test("parseAemetRss extrae nivel, fenómeno, zona y fechas", () => {
  const items = aemet.parseAemetRss(SAMPLE_RSS);
  assert.equal(items.length, 3);

  const menorca = items[0];
  assert.equal(menorca.level, "naranja");
  assert.equal(menorca.phenomenon, "Costeros");
  assert.equal(menorca.zone, "Menorca");
  assert.ok(menorca.start > 0);
  assert.ok(menorca.end > menorca.start);
});

test("los spots costeros reciben avisos de su zona y descartan zonas de interior", async () => {
  const sonbou = spotById.sonbou; // Menorca
  const somo = spotById.somo; // Cantabria
  const famara = spotById.famara; // Lanzarote (sin avisos en el mock)

  const wSonbou = aemet.activeWarningFor(
    sonbou,
    Date.parse("2026-10-09T05:00:00+02:00"),
    aemet.parseAemetRss(SAMPLE_RSS),
  );
  assert.ok(wSonbou);
  assert.equal(wSonbou.level, "naranja");
  assert.equal(wSonbou.phenomenon, "Costeros");

  const wSomo = aemet.activeWarningFor(somo, Date.parse("2026-10-07T12:00:00+02:00"), aemet.parseAemetRss(SAMPLE_RSS));
  assert.ok(wSomo);
  assert.equal(wSomo.phenomenon, "Tormentas");

  const wFamara = aemet.activeWarningFor(famara, Date.now(), aemet.parseAemetRss(SAMPLE_RSS));
  assert.equal(wFamara, null);
});

test("detail incluye el array de avisos oficiales", async () => {
  const d = await detail(spotById.sonbou);
  assert.ok(Array.isArray(d.warnings));
  if (d.warnings.length) {
    const w = d.warnings[0];
    assert.ok(w.level);
    assert.ok(w.phenomenon);
    assert.ok(w.zone);
  }
});

test("overview incluye warning en los spots afectados", async () => {
  const o = await overview();
  const menorca = o.spots.find((s) => s.id === "sonbou");
  assert.ok(menorca);
  // en el mock de fixtures, Menorca tiene aviso naranja
  assert.ok(menorca.warning);
  assert.equal(menorca.warning.level, "naranja");
  assert.equal(menorca.warning.phenomenon, "Costeros");
});

test("el lector XML entiende CDATA, entidades, atributos y varias líneas", async () => {
  const xml = await import("../server/sources/xml.js");
  assert.equal(xml.tag("<a><![CDATA[<b>5 &amp; 6</b>]]></a>", "a"), "<b>5 &amp; 6</b>");
  assert.equal(xml.tag("<a>Fuerte &amp; &lt;peligroso&gt; &#241; &#xF1;</a>", "a"), "Fuerte & <peligroso> ñ ñ");
  assert.equal(xml.tag('<guid isPermaLink="false">x.xml</guid>', "guid"), "x.xml");
  assert.equal(xml.tag("<a>línea 1\nlínea 2</a>", "a"), "línea 1\nlínea 2");
  assert.equal(xml.tag("<a>1</a>", "b"), null);
  assert.deepEqual(xml.blocks("<info>uno</info><info lang='en'>dos</info>", "info"), ["uno", "dos"]);
  assert.equal(xml.text("&#99999999999;"), "");
});

test("parseAemetRss lee avisos con CDATA y descripción en varias líneas", () => {
  const rss = `<rss><channel><item>
    <title><![CDATA[Aviso. Nivel rojo. Costeros. Litoral gallego]]></title>
    <description>Aviso de costeros
      de 00:00 09-10-2026 CEST (UTC+2) a 14:59 09-10-2026 CEST (UTC+2).</description>
    <link>https://www.aemet.es/x.xml</link><guid isPermaLink="false">g1</guid>
  </item></channel></rss>`;
  const [w] = aemet.parseAemetRss(rss);
  assert.equal(w.level, "rojo");
  assert.equal(w.zone, "Litoral gallego");
  assert.equal(w.id, "g1");
  assert.ok(w.start && w.end);
});

test("solo se piden detalles a URLs https de aemet.es", async () => {
  for (const u of [
    "http://www.aemet.es/x.xml",
    "https://evil.example/x.xml",
    "https://aemet.es.evil.example/x",
    "ftp://aemet.es/x",
  ])
    assert.equal(await aemet.fetchCapDetail(u), null, u);
});

test("alertableWarnings: fenómenos de mar y viento en cualquier nivel; el resto solo en naranja o rojo", () => {
  const now = Date.now();
  const w = (level, phenomenon) => ({
    id: `${level}-${phenomenon}`,
    level,
    phenomenon,
    zone: "Litoral cántabro",
    start: now - 3600e3,
    end: now + 3600e3,
  });
  const all = [
    w("amarillo", "Costeros"),
    w("amarillo", "Vientos"),
    w("amarillo", "Tormentas"),
    w("amarillo", "Galerna"),
    w("amarillo", "Rissaga"),
    w("amarillo", "Lluvias"),
    w("amarillo", "Temperaturas máximas"),
    w("amarillo", "Niebla"),
    w("naranja", "Lluvias"),
    w("rojo", "Temperaturas máximas"),
  ];
  const got = aemet
    .alertableWarnings(spotById.somo, all, now)
    .map((x) => x.id)
    .sort();
  assert.deepEqual(
    got,
    [
      "amarillo-Costeros",
      "amarillo-Galerna",
      "amarillo-Rissaga",
      "amarillo-Tormentas",
      "amarillo-Vientos",
      "naranja-Lluvias",
      "rojo-Temperaturas máximas",
    ].sort(),
  );
});

test("isRss distingue un feed real de una página de rechazo con HTTP 200", () => {
  assert.equal(aemet.isRss(SAMPLE_RSS), true);
  assert.equal(aemet.isRss("<html><head><title>Request Rejected</title></head></html>"), false);
  assert.equal(aemet.isRss(""), false);
});
