import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { outputs, load } from "../scripts/i18n.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("los textos generados de la web y las apps están al día con i18n/strings.json", () => {
  for (const [file, content] of Object.entries(outputs())) {
    assert.equal(fs.readFileSync(path.join(ROOT, file), "utf8"), content, `${file} desactualizado: ejecuta node scripts/i18n.mjs`);
  }
});

test("cada texto tiene español e inglés con los mismos valores", () => {
  const s = load();
  assert.ok(Object.keys(s).length > 200);
});

test("la web y las apps solo usan claves que existen", () => {
  const keys = new Set(Object.keys(load()));
  const scan = (dir, re) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
      const file = path.join(ROOT, dir, String(f));
      if (!fs.statSync(file).isFile() || !/\.(js|swift|kt)$/.test(file) || file.endsWith("strings.js")) continue;
      for (const m of fs.readFileSync(file, "utf8").matchAll(re)) {
        if (m[1] === "app_name") continue;
        assert.ok(keys.has(m[1]) || keys.has(m[1].replace(/_/g, ".")), `${path.relative(ROOT, file)}: clave desconocida ${m[1]}`);
      }
    }
  };
  scan("public/js", /\bt\("([\w.]+)"/g);
  scan("ios/Marea", /\bL\("([\w.]+)"/g);
  scan("android/app/src/main/java", /R\.string\.(\w+)/g);
});
