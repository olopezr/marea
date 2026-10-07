// Cloudflare Worker: Proxy de caché para Open-Meteo
// Evita el bloqueo por IP compartida en alojamientos como Render y almacena
// las previsiones en la red global de Cloudflare para ahorrar llamadas.

const TTL_SECONDS = 7200; // 2 horas de caché en Cloudflare

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Healthcheck
    if (pathname === "/health" || pathname === "/") {
      return new Response(JSON.stringify({ ok: true, service: "marea-openmeteo-proxy" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mapeo a las APIs reales de Open-Meteo
    let targetHost;
    if (pathname.startsWith("/v1/marine")) {
      targetHost = "https://marine-api.open-meteo.com";
    } else if (pathname.startsWith("/v1/forecast")) {
      targetHost = "https://api.open-meteo.com";
    } else {
      return new Response(JSON.stringify({ error: "Endpoint no soportado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Construye la URL de destino conservando todos los parámetros de búsqueda
    const targetUrl = new URL(pathname + url.search, targetHost);

    // Si hay una clave configurada en los secretos de Cloudflare, la añade
    if (env.OPEN_METEO_API_KEY && !targetUrl.searchParams.has("apikey")) {
      targetUrl.searchParams.set("apikey", env.OPEN_METEO_API_KEY);
    }

    // Consulta la caché de Cloudflare Edge
    const cache = caches.default;
    // Usamos targetUrl como clave de caché normalizada
    const cacheKey = new Request(targetUrl.toString(), {
      method: "GET",
      headers: request.headers,
    });

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const res = new Response(cachedResponse.body, cachedResponse);
      res.headers.set("X-Proxy-Cache", "HIT");
      return res;
    }

    // Petición a Open-Meteo desde la red de Cloudflare
    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          "User-Agent": "Marea-Proxy/1.0",
          Accept: "application/json",
        },
        cf: {
          cacheTtl: TTL_SECONDS,
          cacheEverything: true,
        },
      });

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("X-Proxy-Cache", "MISS");

      if (upstream.ok) {
        // Marcamos la respuesta como almacenable en la caché de borde
        responseHeaders.set("Cache-Control", `public, max-age=${TTL_SECONDS}`);
        const responseToReturn = new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: responseHeaders,
        });

        // Guarda en la caché de Cloudflare de forma asíncrona
        ctx.waitUntil(cache.put(cacheKey, responseToReturn.clone()));
        return responseToReturn;
      }

      // Si Open-Meteo falla o da error, devuelve el error sin cachearlo
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Error conectando con Open-Meteo", message: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
