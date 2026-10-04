# Vídeo promocional de Marea

Vídeo de 60 s (1920×1080, 60 fps) que presenta la app: el problema de mirar previsión, mareas y boyas en sitios distintos, los spots en el mapa, la valoración, la previsión por horas y a 7 días, la curva de marea deslizable, las medidas en directo, los avisos y el resto de funciones.

El resultado queda en `out/marea-promo.mp4` (con su portada en `out/marea-promo-portada.jpg`). La carpeta `out/` no se sube al repositorio.

## Cómo está hecho

Es una página HTML animada con [GSAP](https://gsap.com) que se renderiza fotograma a fotograma con Chromium y se codifica con ffmpeg. La animación es determinista (`seek(t)` siempre da el mismo fotograma), por eso se puede renderizar en paralelo.

- Las pantallas del móvil usan las mismas clases y estilos que la app (`public/css/app.css`) y las funciones de `public/js/surf.js` y `public/js/tidechart.js`, así que se ven como la app real.
- El mapa y el contador salen de `public/js/spots.js`: si se añaden playas, basta con volver a renderizar.
- La música se sintetiza en `music.mjs` (sin muestras de terceros) y los efectos se colocan en los momentos que marcan las escenas, así que siempre va sincronizada. Se normaliza a −14 LUFS.

```
index.html, promo.css   Página y estilos de la animación
js/timeline.js          Guion: tiempos de cada escena (120 BPM, un compás = 2 s)
js/scenes/*.js          Una escena por archivo
js/data.js              Datos de la historia (un jueves de octubre en Somo)
js/ui.js, js/phone.js   Pantallas de la app y el móvil que las enseña
music.mjs               Banda sonora
render.mjs              Render en paralelo y montaje final
tools/build-map.mjs     Genera assets/map.js (Natural Earth, dominio público)
tools/stills.mjs        Capturas sueltas para revisar sin renderizar todo
```

## Uso

Requiere Node 22+, ffmpeg y el Chromium de Playwright.

```bash
cd promo
npm install
npx playwright install chromium-headless-shell   # si no está ya
node render.mjs                                   # vídeo completo, ~1-2 min
```

Opciones de `render.mjs`:

| Opción | Qué hace |
|---|---|
| `--fps 30` | Otra tasa de fotogramas (por defecto 60) |
| `--scale 2` | 3840×2160 |
| `--from 16 --to 22` | Solo un tramo, para revisar |
| `--audio archivo.mp3` | Usa otra música en lugar de la generada |
| `--no-audio` | Sin sonido |
| `--workers 4` | Número de procesos en paralelo |

Para previsualizar en el navegador: `node serve.mjs` y abre `http://127.0.0.1:8098/promo/index.html?play` (barra espaciadora para pausar, flechas para avanzar fotograma a fotograma). Con `?t=12.5` se congela ese instante.

Para cambiar textos, edita la escena correspondiente en `js/scenes/`; para mover escenas, los tiempos de `js/timeline.js`.
