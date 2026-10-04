// Avisos a las apps nativas: APNs (iOS) y Firebase Cloud Messaging (Android).
// Sin dependencias: los JWT se firman con node:crypto y APNs se llama por HTTP/2.
import crypto from "node:crypto";
import http2 from "node:http2";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signJWT(header, claims, key, alg) {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig =
    alg === "ES256"
      ? crypto.sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" })
      : crypto.sign("sha256", Buffer.from(data), key);
  return `${data}.${b64url(sig)}`;
}

// Error de envío. `gone` indica que el token ya no vale y hay que borrar la suscripción.
const fail = (msg, statusCode, gone = false) => Object.assign(new Error(msg), { statusCode, gone });

// ---------- APNs ----------
// Petición HTTP/2 reutilizando una sesión por servidor; se reabre si se cierra.
const sessions = new Map();
function http2Request(origin, headers, body) {
  return new Promise((resolve, reject) => {
    let session = sessions.get(origin);
    if (!session || session.closed || session.destroyed) {
      session = http2.connect(origin);
      session.on("error", () => sessions.delete(origin));
      session.on("close", () => sessions.delete(origin));
      session.setTimeout(10 * 60e3, () => session.close());
      sessions.set(origin, session);
    }
    const req = session.request({ ":method": "POST", ...headers });
    let status = 0,
      data = "";
    req.setEncoding("utf8");
    req.on("response", (h) => {
      status = h[":status"];
    });
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => resolve({ status, body: data }));
    req.on("error", reject);
    req.setTimeout(15e3, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end(body);
  });
}

export function createApns({ keyId, teamId, key, bundleId, sandbox }, request = http2Request) {
  const origin = sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  let jwt = null,
    jwtAt = 0;
  // Apple pide renovar el token entre 20 y 60 minutos.
  const token = () => {
    if (!jwt || Date.now() - jwtAt > 50 * 60e3) {
      jwtAt = Date.now();
      jwt = signJWT({ alg: "ES256", kid: keyId }, { iss: teamId, iat: Math.floor(jwtAt / 1000) }, key, "ES256");
    }
    return jwt;
  };
  return async function send(deviceToken, payload, { ttl = 6 * 3600 } = {}) {
    const headers = {
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${token()}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl),
      "content-type": "application/json",
    };
    if (payload.tag) headers["apns-collapse-id"] = String(payload.tag).slice(0, 64);
    const body = JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      url: payload.url,
    });
    const res = await request(origin, headers, body);
    if (res.status === 200) return;
    let reason = "";
    try {
      reason = JSON.parse(res.body).reason ?? "";
    } catch {}
    const gone = res.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason);
    throw fail(`APNs ${res.status} ${reason}`.trim(), res.status, gone);
  };
}

// ---------- FCM (HTTP v1) ----------
// Con tiempo máximo: una respuesta colgada no debe bloquear la revisión de avisos.
export function createFcm(
  account,
  fetchFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15e3) }),
) {
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  let access = null,
    accessUntil = 0;
  async function accessToken() {
    if (access && Date.now() < accessUntil) return access;
    const iat = Math.floor(Date.now() / 1000);
    const assertion = signJWT(
      { alg: "RS256", typ: "JWT" },
      {
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: tokenUri,
        iat,
        exp: iat + 3600,
      },
      account.private_key,
      "RS256",
    );
    const res = await fetchFn(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    if (!res.ok) throw fail(`FCM OAuth ${res.status}`, res.status);
    const data = await res.json();
    access = data.access_token;
    accessUntil = Date.now() + Math.min(55 * 60e3, (data.expires_in ?? 3600) * 1000 - 60e3);
    return access;
  }
  return async function send(deviceToken, payload, { ttl = 6 * 3600 } = {}) {
    const message = {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
      android: {
        priority: "high",
        ttl: `${ttl}s`,
        ...(payload.tag ? { collapse_key: payload.tag } : {}),
        notification: { channel_id: "avisos", ...(payload.tag ? { tag: payload.tag } : {}) },
      },
    };
    const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) return;
    const err = await res.json().catch(() => ({}));
    const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? "";
    const gone = res.status === 404 || code === "UNREGISTERED";
    throw fail(`FCM ${res.status} ${code}`.trim(), res.status, gone);
  };
}

// ---------- Configuración desde el entorno ----------
export function fromEnv(env = process.env) {
  let apns = null,
    fcm = null;
  if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY && env.APNS_BUNDLE_ID) {
    apns = createApns({
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
      bundleId: env.APNS_BUNDLE_ID,
      key: env.APNS_KEY.replace(/\\n/g, "\n"),
      sandbox: env.APNS_SANDBOX === "true",
    });
  } else {
    console.warn(
      "[push] Sin APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY y APNS_BUNDLE_ID: no se enviarán avisos a la app de iOS.",
    );
  }
  if (env.FCM_SERVICE_ACCOUNT) {
    try {
      fcm = createFcm(JSON.parse(env.FCM_SERVICE_ACCOUNT));
    } catch {
      console.warn("[push] FCM_SERVICE_ACCOUNT no es un JSON válido: no se enviarán avisos a la app de Android.");
    }
  } else {
    console.warn("[push] Sin FCM_SERVICE_ACCOUNT: no se enviarán avisos a la app de Android.");
  }
  return { apns, fcm };
}
