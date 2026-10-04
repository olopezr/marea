import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApns, createFcm, signJWT } from "../server/native-push.js";

const parts = (jwt) =>
  jwt.split(".").map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, "base64url")) : Buffer.from(p, "base64url")));
const payload = {
  title: "Somo se pone bueno hoy",
  body: "Mejor hacia las 10:00",
  url: "/#/spot/somo",
  tag: "somo-2026-10-03",
};

test("signJWT firma ES256 en formato JOSE verificable", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwt = signJWT({ alg: "ES256", kid: "K" }, { iss: "T" }, privateKey, "ES256");
  const [h, c, sig] = parts(jwt);
  assert.deepEqual(h, { alg: "ES256", kid: "K" });
  assert.deepEqual(c, { iss: "T" });
  assert.equal(sig.length, 64);
  const data = jwt.split(".").slice(0, 2).join(".");
  assert.ok(crypto.verify("sha256", Buffer.from(data), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig));
});

test("APNs: petición, cabeceras y baja de tokens inválidos", async () => {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const key = privateKey.export({ type: "pkcs8", format: "pem" });
  const calls = [];
  let reply = { status: 200, body: "" };
  const send = createApns(
    { keyId: "KID", teamId: "TEAM", key, bundleId: "es.marea.app", sandbox: true },
    async (origin, headers, body) => {
      calls.push({ origin, headers, body: JSON.parse(body) });
      return reply;
    },
  );

  await send("ab".repeat(32), payload);
  const [c] = calls;
  assert.equal(c.origin, "https://api.sandbox.push.apple.com");
  assert.equal(c.headers[":path"], `/3/device/${"ab".repeat(32)}`);
  assert.equal(c.headers["apns-topic"], "es.marea.app");
  assert.equal(c.headers["apns-collapse-id"], payload.tag);
  assert.equal(parts(c.headers.authorization.slice(7))[1].iss, "TEAM");
  assert.deepEqual(c.body, {
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    url: payload.url,
  });

  reply = { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
  await assert.rejects(send("ab".repeat(32), payload), (err) => err.gone === true);
  reply = { status: 503, body: JSON.stringify({ reason: "ServiceUnavailable" }) };
  await assert.rejects(send("ab".repeat(32), payload), (err) => err.gone === false && err.statusCode === 503);
});

test("FCM: token OAuth cacheado, mensaje y baja de tokens UNREGISTERED", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = {
    project_id: "marea-test",
    client_email: "push@marea-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: "https://oauth2.example/token",
  };
  const calls = [];
  let sendReply = { ok: true, status: 200, json: async () => ({}) };
  const send = createFcm(account, async (url, init) => {
    calls.push({ url, init });
    if (url === account.token_uri)
      return { ok: true, status: 200, json: async () => ({ access_token: "ya29.x", expires_in: 3600 }) };
    return sendReply;
  });

  await send("tok-1", payload);
  await send("tok-2", payload);
  assert.equal(calls.filter((c) => c.url === account.token_uri).length, 1, "reutiliza el token OAuth");
  const assertion = new URLSearchParams(calls[0].init.body).get("assertion");
  assert.equal(parts(assertion)[1].iss, account.client_email);
  const msg = calls[1];
  assert.equal(msg.url, "https://fcm.googleapis.com/v1/projects/marea-test/messages:send");
  assert.equal(msg.init.headers.Authorization, "Bearer ya29.x");
  const { message } = JSON.parse(msg.init.body);
  assert.equal(message.token, "tok-1");
  assert.deepEqual(message.data, { url: payload.url, tag: payload.tag });
  assert.equal(message.android.notification.channel_id, "avisos");

  sendReply = {
    ok: false,
    status: 404,
    json: async () => ({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }),
  };
  await assert.rejects(send("tok-1", payload), (err) => err.gone === true);
  sendReply = { ok: false, status: 429, json: async () => ({ error: { status: "RESOURCE_EXHAUSTED" } }) };
  await assert.rejects(send("tok-1", payload), (err) => err.gone === false);
});
