# Marea

App web instalable (PWA) que reúne en un solo sitio el estado del mar para 83 spots de surf de España:

- **Previsión** de oleaje, mar de fondo, viento, temperatura y horas de luz (Open-Meteo), por horas a 7 días.
- **Mareas oficiales** del Instituto Hidrográfico de la Marina, en el puerto de referencia más cercano.
- **Medidas reales** de Puertos del Estado: oleaje de boyas (a menos de 100 km), viento, temperatura y presión de estaciones (a menos de 40 km) y nivel del mar de los mareógrafos.
- **Curva de marea deslizable** con hora, altura, coeficiente, efecto de la meteorología y nivel medido.
- **Valoración** de 0 a 5 por spot y hora, según ola, periodo, exposición, viento y marea.
- **Avisos oficiales de AEMET** (Plan Meteoalerta en formato CAP): alertas en tiempo real por fenómenos costeros, viento, tormentas o galernas cruzados por spot.
- **Avisos push** cuando un spot elegido supera el umbral de calidad, como máximo uno por spot y día.
- Favoritos, ordenar por cercanía, modo sin conexión, tema claro y oscuro, e instalable en iOS y Android.
- **Apps nativas** para iOS (SwiftUI) y Android (Jetpack Compose) con los mismos datos y avisos push nativos (ver [Apps nativas](#apps-nativas)).

## Puesta en marcha

Requiere Node.js 22.13 o posterior.

```bash
npm install
cp .env.example .env     # y rellénalo (ver abajo)
npm start                # http://localhost:8800
npm run dev              # servidor con recarga automática
npm run worker           # ejecuta el programador de avisos de forma independiente
npm test                 # tests sin red
npm run test:coverage    # tests con informe de cobertura
npm run lint             # comprobación de estilo con ESLint
npm run format           # formateo automático con Prettier
npm run check            # verificación completa (lint + format + test)
```

## Configuración

| Variable                                                    | Obligatoria                           | Qué es                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                      | No (8800)                             | Puerto HTTP                                                                                                            |
| `DATA_DIR`                                                  | No (`./data`)                         | Base de datos SQLite de avisos. En producción, un volumen persistente                                                  |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`                     | Sí, en producción                     | Claves de notificaciones push. Genera unas con `npm run vapid`. Si cambian, todas las suscripciones dejan de funcionar |
| `VAPID_SUBJECT`                                             | Sí, en producción                     | `mailto:` de contacto para los servicios push                                                                          |
| `OPEN_METEO_API_KEY`                                        | Sí, si el uso es comercial            | Clave del plan de pago de Open-Meteo                                                                                   |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`, `APNS_BUNDLE_ID` | Para avisos en la app de iOS          | Clave `.p8` de Apple Push Notifications (`APNS_KEY` es su contenido). `APNS_SANDBOX=true` para compilaciones de Xcode  |
| `FCM_SERVICE_ACCOUNT`                                       | Para avisos en la app de Android      | JSON de una cuenta de servicio del proyecto de Firebase                                                                |
| `KEEP_AWAKE_URL`                                            | No (en Render, `RENDER_EXTERNAL_URL`) | URL pública que el servidor visita cada 10 min para que el plan gratuito de Render no lo duerma                        |
| `CORS_ORIGINS`                                              | No (`https://olopezr.github.io`)      | Orígenes, separados por comas, que pueden leer la API desde otra web (la landing)                                      |
| `ENABLE_SCHEDULER`                                          | No (true)                             | Inicia el programador de avisos en el servidor web. Pon `false` si ejecutas un worker independiente                    |
| `WORKER_RUN_ON_START`                                       | No (false)                            | Si es `true`, el worker ejecuta una revisión de avisos al arrancar                                                     |

Sin claves VAPID, el servidor genera unas y las guarda en `DATA_DIR/vapid.json` (válido para desarrollo).

## Despliegue

### Gratis en Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/olopezr/marea)

El archivo `render.yaml` crea un servicio web gratuito en Frankfurt con el Dockerfile. Limitaciones del plan gratuito:

- Se duerme tras 15 minutos sin visitas; la primera visita después tarda 30–60 s.
- No conserva archivos: las suscripciones a avisos se pierden en cada reinicio o despliegue y los avisos no se revisan mientras duerme. Para avisos fiables hace falta un plan con disco persistente o una base de datos externa.

### Con Docker Compose

Puedes desplegar la aplicación completa con persistencia en un único comando:

```bash
# Servidor web estándar:
docker compose up -d

# Con worker independiente de alertas (escalado horizontal del web):
docker compose --profile worker up -d
```

### Con contenedor Docker individual

```bash
docker build -t marea .
docker run -d -p 8080:8080 -v marea-data:/data --env-file .env marea
```

Requisitos del entorno:

- **HTTPS obligatorio**: sin él no funcionan ni la instalación ni las notificaciones. La mayoría de plataformas lo dan de serie.
- **Escalado**: para escalar a varias instancias web, desactiva el scheduler en el servidor (`ENABLE_SCHEDULER=false`) y ejecuta el contenedor del worker (`docker compose --profile worker up`).
- Salud: `GET /api/health`.

Al publicar una versión nueva, cambia `VERSION` en `public/sw.js` para que los móviles descarten la caché anterior.

## Estructura

```
server/
  index.js           Servidor HTTP: estáticos, API, cabeceras de seguridad, límite de peticiones
  worker.js          Worker independiente para la revisión y envío periódico de alertas push
  conditions.js      Combina las fuentes y calcula valoraciones, mejores horas y días
  push.js            Suscripciones (SQLite), revisión horaria y envío de avisos
  native-push.js     Envío a las apps: APNs (HTTP/2 + JWT ES256) y FCM HTTP v1, sin dependencias
  cache.js           Caché en memoria con TTL; si una fuente cae, sirve el último dato bueno
  sources/
    openmeteo.js     Previsión de todos los spots en una petición por API (caché 1 h, por el límite de llamadas)
    ihm.js           Mareas oficiales por mes y puerto (caché 12 h)
    portus.js        Puertos del Estado: boyas, estaciones, mareógrafos y nivel del mar por playa
    aemet.js         Avisos oficiales de la AEMET (Plan Meteoalerta CAP, caché 15 min)
public/
  js/spots.js        Lista de spots (compartida con el servidor)
  js/surf.js         Lógica pura compartida: valoración, mareas, zonas horarias
  js/app.js          Interfaz: lista, detalle y avisos
  js/tidechart.js    Curva de marea con cursor deslizable
  js/alerts.js       Suscripción push en el navegador
  sw.js              Modo sin conexión y recepción de avisos
  legal/             Fuentes de datos, privacidad y aviso legal
test/                Tests con fuentes simuladas (node --test)
ios/                 App de iOS (SwiftUI, iOS 17+), proyecto generado con XcodeGen
  fastlane/          Automatización de tests y subida a TestFlight
android/             App de Android (Kotlin, Jetpack Compose, Android 8+)
  fastlane/          Automatización de tests y subida a Google Play
scripts/             export-spots.mjs copia la lista de spots a las apps; i18n.mjs compila textos
.github/workflows/   Integración continua (CI): linter, formato, sincronización y tests
docker-compose.yml   Orquestación de servicios web y worker persistente
```

### API

| Ruta                                             | Respuesta                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/spots`                                 | Resumen de todos los spots: valoración, condiciones, marea y boya                                                               |
| `GET /api/spots/:id`                             | Detalle: curva de marea del día, 24 horas y 7 días                                                                              |
| `GET /api/push/key`                              | Clave pública VAPID                                                                                                             |
| `GET /api/spots/:id/boya`                        | Solo la boya del spot (la lista la pide por tarjeta)                                                                            |
| `POST /api/push/subscribe`                       | `{ subscription, spots, minScore }` (navegador) o `{ device: { platform: "ios" \| "android", token }, spots, minScore }` (apps) |
| `POST /api/push/status`, `/unsubscribe`, `/test` | `{ endpoint }`; en las apps, `"apns:<token>"` o `"fcm:<token>"`                                                                 |

## Apps nativas

Dos apps nativas, una por plataforma, que usan la misma API que la web y repiten sus pantallas (lista, mapa de spots, detalle con curva de marea deslizable, boya frente a previsión y avisos), textos, colores y tipografías. La valoración la sigue calculando el servidor. Guardan la última respuesta para abrir sin conexión.

Al cambiar `public/js/spots.js`, ejecuta `node scripts/export-spots.mjs` para copiar la lista a las apps (un test lo comprueba).

### Idiomas

La web y las apps están en español e inglés (según el idioma del navegador o del móvil; español por defecto). Todos los textos están en `i18n/strings.json`; tras cambiarlo, ejecuta `node scripts/i18n.mjs` para generar `public/js/strings.js`, los `Localizable.strings` de iOS y los `strings.xml` de Android (un test comprueba que están al día y que el código solo usa claves que existen). Los avisos push llegan en el idioma con el que se activaron.

### iOS (`ios/`)

Requiere Xcode 16 o posterior y [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cd ios && xcodegen          # genera Marea.xcodeproj a partir de project.yml
open Marea.xcodeproj
```

- **URL del servidor**: `MAREA_API_BASE` en `project.yml` (Debug: `http://localhost:8080`; Release: tu dominio). Para probar contra otro puerto: `xcodebuild ... MAREA_API_BASE=http://localhost:8099`.
- **Avisos**: en Apple Developer, crea el App ID `es.marea.app` con _Push Notifications_ y una clave APNs (`.p8`); pon tu equipo en `DEVELOPMENT_TEAM` y define en el servidor `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` y `APNS_BUNDLE_ID`. En el simulador sin equipo se usa un token de prueba para poder probar la pantalla de avisos.
- **Tests**: `xcodebuild test -project Marea.xcodeproj -scheme Marea -destination 'platform=iOS Simulator,name=iPhone 17'`.
- **Automatización (Fastlane)**: `cd ios && bundle exec fastlane test` para tests o `bundle exec fastlane beta` para compilar y enviar a TestFlight.

### Android (`android/`)

Requiere JDK 17+ y el SDK de Android (compileSdk 37).

```bash
cd android
./gradlew installDebug                                         # emulador o móvil conectado
./gradlew installDebug -PmareaApiBaseDebug=http://10.0.2.2:8099 # otro puerto del Mac
./gradlew testDebugUnitTest
```

- **URL del servidor**: `mareaApiBaseDebug` y `mareaApiBaseRelease` en `gradle.properties` (`10.0.2.2` es el Mac visto desde el emulador).
- **Avisos**: crea un proyecto de Firebase con la app `es.marea.app`, descarga `google-services.json` a `android/app/` (no se sube al repositorio) y define `FCM_SERVICE_ACCOUNT` en el servidor. Sin ese archivo la app compila igual; en Debug usa un token de prueba y en Release los avisos quedan desactivados.
- **Bundle firmado para Google Play**: con `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD` definidos, `scripts/release-android.sh` compila y verifica el `.aab` (Play no acepta `.apk`). Guarda el keystore fuera del repositorio y con copia de seguridad: sin él no puedes actualizar la app.
- **Automatización (Fastlane)**: `cd android && bundle exec fastlane test` para tests o `bundle exec fastlane beta` para publicar en el canal interno de Google Play.

## Mapas

La web y la app de Android usan [MapLibre](https://maplibre.org) con el estilo de [OpenFreeMap](https://openfreemap.org): libre, sin claves, sin límite de visitas y con uso comercial permitido (las teselas de openstreetmap.org no admiten apps con tráfico). La atribución la muestra MapLibre. La app de iOS usa Apple Maps. MapLibre GL JS está en `public/vendor/maplibre` (licencia BSD-3).

## Notas sobre los datos

- **Boyas tapadas por tierra**: `server/data/buoy-sight.json` lista, para cada playa, las boyas cuya línea hasta el mar de la playa cruza tierra (un cabo, una isla); esas boyas no se usan para ella. Se genera con `node scripts/buoy-sight.mjs` (consulta el modelo de elevación de Open-Meteo) y hay que repetirlo al añadir playas o al cambiar sus coordenadas.

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
6. **Tiendas de apps**: las apps nativas están en `ios/` y `android/`. Hacen falta cuentas de desarrollador (25 USD una vez en Google; 99 USD al año en Apple), la URL de producción en `project.yml` y `gradle.properties`, credenciales de APNs y Firebase, iconos y capturas para las fichas, y probar los avisos en móviles reales.
