# Marea

App web instalable (PWA) que reúne en un solo sitio el estado del mar para 27 spots de surf de España:

- **Previsión** de oleaje, mar de fondo, viento, temperatura y horas de luz (Open-Meteo), por horas a 7 días.
- **Mareas oficiales** del Instituto Hidrográfico de la Marina, en el puerto de referencia más cercano.
- **Medidas reales** de Puertos del Estado: oleaje de boyas (a menos de 100 km), viento, temperatura y presión de estaciones (a menos de 40 km) y nivel del mar de los mareógrafos.
- **Curva de marea deslizable** con hora, altura, coeficiente, efecto de la meteorología y nivel medido.
- **Valoración** de 0 a 5 por spot y hora, según ola, periodo, exposición, viento y marea.
- **Avisos push** cuando un spot elegido supera el umbral de calidad, como máximo uno por spot y día.
- Favoritos, ordenar por cercanía, modo sin conexión, tema claro y oscuro, e instalable en iOS y Android.

## Puesta en marcha

Requiere Node.js 22.13 o posterior.

```bash
npm install
cp .env.example .env     # y rellénalo (ver abajo)
npm start                # http://localhost:8080
npm test                 # 32 tests, sin red
```

## Configuración

| Variable | Obligatoria | Qué es |
|---|---|---|
| `PORT` | No (8080) | Puerto HTTP |
| `DATA_DIR` | No (`./data`) | Base de datos SQLite de avisos. En producción, un volumen persistente |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Sí, en producción | Claves de notificaciones push. Genera unas con `npm run vapid`. Si cambian, todas las suscripciones dejan de funcionar |
| `VAPID_SUBJECT` | Sí, en producción | `mailto:` de contacto para los servicios push |
| `OPEN_METEO_API_KEY` | Sí, si el uso es comercial | Clave del plan de pago de Open-Meteo |

Sin claves VAPID, el servidor genera unas y las guarda en `DATA_DIR/vapid.json` (válido para desarrollo).

## Despliegue

### Gratis en Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/olopezr/marea)

El archivo `render.yaml` crea un servicio web gratuito en Frankfurt con el Dockerfile. Limitaciones del plan gratuito:
- Se duerme tras 15 minutos sin visitas; la primera visita después tarda 30–60 s.
- No conserva archivos: las suscripciones a avisos se pierden en cada reinicio o despliegue y los avisos no se revisan mientras duerme. Para avisos fiables hace falta un plan con disco persistente o una base de datos externa.

### Con disco persistente

La app es un único proceso Node con una carpeta de datos. Funciona en cualquier servicio que ejecute contenedores con un volumen persistente: Fly.io, Railway, Render, un VPS con Docker, etc.

```bash
docker build -t marea .
docker run -d -p 8080:8080 -v marea-data:/data --env-file .env marea
```

Requisitos del entorno:
- **HTTPS obligatorio**: sin él no funcionan ni la instalación ni las notificaciones. La mayoría de plataformas lo dan de serie.
- **Una sola instancia**: la caché y el programador de avisos viven en memoria y la base de datos es SQLite. Para escalar a varias instancias habría que mover las suscripciones a PostgreSQL y el programador a un único proceso.
- Salud: `GET /api/health`.

Al publicar una versión nueva, cambia `VERSION` en `public/sw.js` para que los móviles descarten la caché anterior.

## Estructura

```
server/
  index.js           Servidor HTTP: estáticos, API, cabeceras de seguridad, límite de peticiones
  conditions.js      Combina las fuentes y calcula valoraciones, mejores horas y días
  push.js            Suscripciones (SQLite), revisión horaria y envío de avisos
  cache.js           Caché en memoria con TTL; si una fuente cae, sirve el último dato bueno
  sources/
    openmeteo.js     Previsión de todos los spots en una petición por API (caché 30 min)
    ihm.js           Mareas oficiales por mes y puerto (caché 12 h)
    portus.js        Puertos del Estado: boyas, estaciones, mareógrafos y nivel del mar por playa
public/
  js/spots.js        Lista de spots (compartida con el servidor)
  js/surf.js         Lógica pura compartida: valoración, mareas, zonas horarias
  js/app.js          Interfaz: lista, detalle y avisos
  js/tidechart.js    Curva de marea con cursor deslizable
  js/alerts.js       Suscripción push en el navegador
  sw.js              Modo sin conexión y recepción de avisos
  legal/             Fuentes de datos, privacidad y aviso legal
test/                Tests con fuentes simuladas (node --test)
```

### API

| Ruta | Respuesta |
|---|---|
| `GET /api/spots` | Resumen de todos los spots: valoración, condiciones, marea y boya |
| `GET /api/spots/:id` | Detalle: curva de marea del día, 24 horas y 7 días |
| `GET /api/push/key` | Clave pública VAPID |
| `POST /api/push/subscribe` | `{ subscription, spots, minScore }` |
| `POST /api/push/status`, `/unsubscribe`, `/test` | `{ endpoint }` |

## Notas sobre los datos

- **Mareas**: la API del IHM da las horas en **UTC** y las alturas sobre el cero hidrográfico del puerto. Se comprobó con el mareógrafo de Santander de Puertos del Estado: bajamar del 1/10/2026 predicha a las 12:12 con 0,93 m y medida a las 12:13 UTC con 0,89 m. La marea del modelo de Open-Meteo se adelantaba unos 30 minutos en el Cantábrico; solo se usa si el IHM no responde.
- **Coeficiente de marea**: estimado como `70 × carrera de la marea / carrera media del puerto` (la carrera media se calcula con tres meses de predicciones del IHM). En Santander da 69 y 58 para las dos mareas del 2/10/2026, frente a 64 de media diaria en una tabla pública de referencia. Los coeficientes oficiales franceses y españoles se calculan respecto a Brest, así que puede haber unas unidades de diferencia.
- **Efecto de la meteorología**: residuo del modelo NIVMAR de Puertos del Estado para la playa más cercana (a menos de 8 km).
- **Nivel medido**: mareógrafo de Puertos del Estado a menos de 30 km del puerto de referencia (en esa distancia la marea es prácticamente la misma). Como cada mareógrafo usa su propio cero, las lecturas se toman respecto al nivel medio del mar y se colocan sobre el nivel medio del puerto según el IHM. Solo se dibuja si la forma de la serie encaja con la predicción (diferencia típica < 35 cm) y el último dato tiene menos de 3 horas. Con datos reales la diferencia típica es de 3 a 18 cm.
- **Viento, temperatura del aire y presión medidos**: estación de Puertos del Estado más cercana a menos de 40 km. Se descartan los valores que la propia API marca como avería.
- **Boyas**: el campo `incidencia` de Puertos del Estado no es fiable (marca "En tierra" boyas que transmiten). Una boya se usa si su dato tiene menos de 3 horas, es plausible y la boya está a menos de 15 km de su posición nominal.
- **Spots**: coordenadas, orientación y marea preferida son aproximadas. Hay que validarlas con surfers locales antes de publicar (`public/js/spots.js`).
- **Valoración**: los umbrales de `rate()` en `public/js/surf.js` son una primera calibración.

## Pendiente antes de publicar

Cosas que no se pueden resolver desde el código:

1. **Licencias de datos**
   - Open-Meteo: el plan gratuito es solo para uso no comercial. Con suscripciones de pago o publicidad hay que contratar su plan y definir `OPEN_METEO_API_KEY`.
   - Puertos del Estado: la API de boyas, estaciones, mareógrafos y nivel del mar por playa es la que usa su web y no está documentada como servicio público. Pedir autorización o un acceso oficial antes de lanzar.
   - IHM: confirmar las condiciones de reutilización de su API de mareas.
2. **Textos legales**: completar los campos marcados en `public/legal/privacidad.html` y `public/legal/aviso-legal.html` (titular, NIF, dirección, contacto, proveedor de alojamiento) y que los revise un profesional.
3. **Dominio, alojamiento y claves VAPID** de producción, con `VAPID_SUBJECT` apuntando a un correo real.
4. **Validación de spots y valoración** con surfers de cada zona.
5. **Prueba de avisos en móviles reales**: Android con Chrome e iPhone con la app instalada (iOS 16.4 o posterior).
6. **Tiendas de apps** (opcional): la PWA se puede empaquetar para Google Play con una Trusted Web Activity y para la App Store con Capacitor. Hacen falta cuentas de desarrollador (25 USD una vez en Google; 99 USD al año en Apple).
