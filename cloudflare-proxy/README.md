# Cloudflare Worker: Proxy de Caché para Open-Meteo

Este worker actúa como pasarela intermedia entre tu app de **Marea** (en Render) y los servidores de **Open-Meteo**.

### ¿Qué soluciona?

- **Evita el error 429 por IP compartida en Render:** Open-Meteo ve la IP de salida de Cloudflare en lugar de la IP compartida de Render.
- **Caché Edge de 2 horas:** Guarda las respuestas en la red mundial de Cloudflare (`caches.default`), reduciendo las llamadas a Open-Meteo y haciendo las respuestas ultra-rápidas.
- **100% Gratuito:** El plan gratuito de Cloudflare Workers incluye **100.000 peticiones al día** (Marea usa menos de 500 al día a través del proxy).

---

## 🚀 Despliegue en 2 minutos

### Método A: Desde la web de Cloudflare (Sin instalar nada)

1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com/) e inicia sesión (o crea cuenta gratis).
2. En el menú lateral izquierdo, ve a **Compute (Workers) > Workers & Pages**.
3. Haz clic en **Create application** (o _Crear aplicación_) > **Create Worker**.
4. Nómbralo `marea-openmeteo-proxy` y pulsa **Deploy**.
5. Pulsa en **Edit code** (o _Editar código_).
6. Borra todo el código que aparece y pega el contenido completo del archivo [`worker.js`](worker.js).
7. Pulsa en **Deploy** (arriba a la derecha).
8. Copia la URL pública que te asigna Cloudflare (por ejemplo: `https://marea-openmeteo-proxy.tu-usuario.workers.dev`).

---

### Método B: Desde la terminal con Wrangler

Si tienes Node.js instalado en tu equipo:

```bash
cd cloudflare-proxy
npx wrangler login
npx wrangler deploy
```

---

## ⚙️ Conectar el Proxy a Marea en Render

Una vez tengas tu URL del worker (ejemplo: `https://marea-openmeteo-proxy.tu-usuario.workers.dev`):

1. Ve al panel de control de tu servicio en **Render**.
2. Entra en **Environment**.
3. Añade una nueva variable de entorno:
   - **Key:** `OPEN_METEO_BASE_URL`
   - **Value:** `https://marea-openmeteo-proxy.tu-usuario.workers.dev` (sin barra final)
4. Pulsa **Save Changes**. Render se reiniciará automáticamente y empezará a consultar Open-Meteo a través de tu Cloudflare Worker sin sufrir bloqueos de IP.
