# USA Car Plates 🇺🇸🚗 — versión iPhone

Juego para cualquier grupo (amigos, familia, niños en un viaje en auto):
registrar las patentes de cada estado de EEUU que cada jugador ha visto en
la calle. Mapa interactivo, sin login.

Cada vez que se abre, la app muestra una **pantalla de inicio** con el logo
y un menú: **Continuar** (solo si hay una partida en curso), **Juego nuevo**,
**Opciones** (por ahora vacío) y **Salir**. "Juego nuevo" pregunta cuántos
jugadores hay y sus nombres; si había una partida, pide confirmación y solo
la reemplaza cuando se confirman los jugadores ("Atrás" la conserva). iOS no
permite que una app se cierre sola, así que "Salir" explica cómo salir.

Esta rama (`usaplates-iphone`) es la versión **app de iPhone, 100 % offline**:
no hay servidor ni conexión a internet; la partida se guarda en el propio
teléfono y se puede seguir jugando en distintos días. La versión servidor
(Django + Docker) sigue en `master`.

## Stack

- **App:** HTML + CSS + JS (módulos ES), sin frameworks.
- **Mapa:** paths SVG precalculados a partir del dataset público
  [us-atlas](https://github.com/topojson/us-atlas) (dominio público, US
  Census); zoom/pan con `d3-selection` + `d3-zoom`.
- **Base de datos local:** [Capacitor Preferences](https://capacitorjs.com/docs/apis/preferences)
  (en iPhone, `UserDefaults`: almacenamiento nativo que iOS no borra por su
  cuenta y que entra en los respaldos de iCloud). En el navegador del
  computador usa `localStorage`.
- **Empaquetado iOS:** [Capacitor](https://capacitorjs.com/) 8.
- **Herramientas:** Vite (servidor de desarrollo y build), Vitest (tests de
  reglas), Playwright (tests end-to-end en WebKit y Chromium).

## Modelo de datos

Toda la partida es un único documento JSON (clave `usaplates.game`):

```json
{
  "version": 1,
  "players": [{ "id": 1, "name": "Ana", "avatar": "🤠" }],
  "sightings": { "CA": { "1": "2026-11-12T18:56:00.000Z" } }
}
```

- `players`: en el orden en que se ingresaron (máximo 12, nombres únicos sin
  distinguir mayúsculas, cara de `src/js/avatars.js`).
- `sightings`: estado → id de jugador → fecha en que lo vio por primera vez.
  Que exista la entrada significa "visto".
- Los 50 estados están en `src/js/states.js`. Washington D.C. no es parte
  del juego: el mapa lo dibuja en gris y sin clic.

Si algún día cambia la forma del documento, se sube `version` y se
convierte el documento antiguo en `parse()` de `src/js/game.js` (cumple el
papel que tenían las migraciones de Django).

El color de cada estado en el mapa se deriva de cuántos jugadores lo vieron:

| Jugadores que lo vieron | `status` | Color    |
|-------------------------|----------|----------|
| Ninguno                 | `none`   | Gris     |
| Algunos                 | `some`   | Amarillo |
| Todos                   | `all`    | Verde    |

Debajo del mapa la leyenda muestra "Sin ver", cada jugador con cuántas
patentes ha visto, y "Todos". El botón **Menú** vuelve a la pantalla de
inicio.

El logo (`src/assets/logo.svg`) y la imagen de fondo
(`src/assets/home-bg.svg`) son una propuesta: para cambiarlos basta con
reemplazar esos archivos (pueden ser PNG/JPG ajustando la ruta en
`index.html` y `style.css`).

## Desarrollo y pruebas en Windows

Requisitos: [Node.js](https://nodejs.org/) 20.19+ o 22.12+.

```bash
npm install
```

### Probar en el navegador del computador

```bash
npm run dev
```

Abrir http://localhost:5173/ en Chrome o Edge. Se recarga solo al guardar
cambios.

- **Ver como iPhone:** F12 → botón de dispositivo (Ctrl+Shift+M) → elegir un
  iPhone. El pellizco se simula con Shift + arrastrar.
- **Ver/borrar los datos:** F12 → Application → Local Storage
  (`CapacitorStorage.usaplates.game`). "Clear site data" deja la app como
  recién instalada.
- **Sin internet:** F12 → Network → "Offline".

### Probar en tu iPhone por Wi-Fi

Con el computador y el iPhone en la misma red:

```bash
npm run dev -- --host
```

Vite muestra una dirección `Network: http://192.168.x.x:5173/`; ábrela en
Safari en el iPhone. La primera vez Windows puede preguntar si permite el
acceso a Node.js en la red privada: acepta. Los datos quedan guardados en
Safari del iPhone (separados de la app instalada).

### Tests

```bash
npm test                     # reglas del juego y almacenamiento (Vitest)
npx playwright install webkit chromium   # solo la primera vez
npm run test:e2e             # flujos completos en WebKit (iPhone) y Chrome
```

WebKit es el motor del WebView del iPhone, así que `test:e2e` detecta
diferencias de Safari sin tener un Mac.

Si `npm test` dice `Cannot read properties of undefined (reading 'config')`,
la terminal abrió la carpeta como `c:\...` en minúscula (pasa en VS Code) y
Vitest se confunde. Entra con la letra en mayúscula y repite:
`cd C:\Users\squir\vscode\usaplates`.

### Build de producción

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173/
```

## Compilar la app de iOS (requiere un Mac con Xcode)

El proyecto Xcode está en `ios/` (generado por Capacitor y versionado). En
el Mac:

```bash
npm install
npm run ios:sync   # build web + copia a ios/ + plugins nativos
npm run ios:open   # abre Xcode
```

En Xcode: elegir el equipo de firma (Signing & Capabilities), conectar el
iPhone o elegir un simulador y presionar ▶. Para distribuir por TestFlight
o la App Store se necesita una cuenta de Apple Developer.

Antes de publicar:

- Cambiar `appId` en `capacitor.config.json` (hoy `com.usaplates.app`) por un
  identificador propio (por ejemplo `cl.tunombre.usaplates`) y correr
  `npx cap sync ios`.
- Agregar el ícono y la pantalla de inicio en
  `ios/App/App/Assets.xcassets` (o con `@capacitor/assets`).

Si no tienes Mac: GitHub Actions (runners macOS), Codemagic o un Mac en la
nube pueden compilar y subir a TestFlight.

Cada vez que cambies código web hay que volver a correr `npm run ios:sync`
para que la app nativa lo incluya.

## Regenerar el mapa

`src/js/map-shapes.js` se genera desde `scripts/data/states-albers-10m.json`
y está versionado. Solo hay que regenerarlo si cambia ese archivo:

```bash
npm run build:map
```

## Estructura del proyecto

```
usaplates/
├── index.html               # página única de la app
├── src/
│   ├── assets/              # logo.svg y home-bg.svg (propuesta)
│   ├── css/style.css
│   └── js/
│       ├── app.js           # orquestación, modal de estado, juego nuevo
│       ├── home.js          # pantalla de inicio y menú principal
│       ├── game.js          # reglas del juego + base de datos local
│       ├── api.js           # instancia del juego guardada con Preferences
│       ├── map.js           # mapa SVG + zoom/pan
│       ├── map-shapes.js    # paths del mapa (generado)
│       ├── legend.js        # leyenda / marcador bajo el mapa
│       ├── setup.js         # modal de juego nuevo: cantidad, nombres y caras
│       ├── states.js        # los 50 estados
│       └── avatars.js       # catálogo de caras
├── scripts/
│   ├── build-map.mjs        # genera map-shapes.js
│   └── data/states-albers-10m.json
├── tests/
│   ├── unit/                # Vitest
│   └── e2e/                 # Playwright
├── ios/                     # proyecto Xcode (Capacitor)
├── capacitor.config.json
├── vite.config.js
├── playwright.config.js
└── package.json
```

## Nota sobre la imagen de la patente en el modal

En vez de usar fotos reales de patentes de cada estado (temas de licencias
de imagen y mantenimiento de 50 archivos), el modal genera una "patente"
genérica con CSS mostrando el nombre del estado. Si más adelante quieren
reemplazarla por diseños reales por estado, basta con cambiar el bloque
`.plate` en `index.html`/`style.css` por un `<img>` por estado.
