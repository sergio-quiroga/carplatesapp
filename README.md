# USA Car Plates 🇺🇸🚗

Juego para cualquier grupo (amigos, familia, niños en un viaje en auto):
registrar las patentes de cada estado de EEUU que cada jugador ha visto en
la calle. Mapa interactivo, sin login. Al abrir la app por primera vez se
pregunta cuántos jugadores hay y sus nombres.

## Stack

- **Backend:** Django 5 + Django REST Framework, SQLite.
- **Frontend:** HTML + CSS + JS vanilla, mapa renderizado con
  [D3.js](https://d3js.org/) + [topojson-client](https://github.com/topojson/topojson-client)
  a partir del dataset público [us-atlas](https://github.com/topojson/us-atlas)
  (bordes de estados, dominio público, US Census).
  Todas las librerías están vendorizadas en `plates/static/plates/vendor/`,
  no se cargan desde ningún CDN, así el sitio funciona sin depender de
  internet salvo para el propio tunnel de acceso.
- **Servidor de estáticos:** whitenoise (no hace falta nginx aparte).
- **Deploy:** Docker + docker-compose, pensado para correr en el Steam Deck
  con un Cloudflare Tunnel.

## Modelo de datos

- `State`: los 50 estados (código postal, nombre, FIPS). Washington D.C. no
  es parte del juego: el mapa lo dibuja en gris y sin clic.
- `Player`: los jugadores (nombre único sin distinguir mayúsculas, una cara
  emoji como `avatar` y `position` para el orden). Las caras permitidas están
  en `plates/avatars.py`. Se crean todos juntos en la configuración
  inicial (máximo 12).
- `Sighting`: una fila por `(state, player)` con `first_seen` y
  `last_modified`. No se guarda historial completo, solo el flag actual
  (existe la fila = visto) y sus dos fechas.

Las reglas del juego (estado del mapa, configuración, marcar/desmarcar,
reinicio) viven en `plates/services.py`; vistas y serializers solo las usan.

El color de cada estado en el mapa se deriva de cuántos jugadores lo vieron:

| Jugadores que lo vieron | `status` | Color    |
|-------------------------|----------|----------|
| Ninguno                 | `none`   | Gris     |
| Algunos                 | `some`   | Amarillo |
| Todos                   | `all`    | Verde    |

Debajo del mapa la leyenda muestra "Sin ver", cada jugador con cuántas
patentes ha visto, y "Todos".

Para volver a la pantalla inicial de jugadores (borra jugadores y patentes):

```bash
python manage.py reset_game
```

## Desarrollo local (VSCode)

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

python manage.py migrate
python manage.py seed_states     # carga/actualiza los 50 estados
python manage.py runserver
```

Abrir http://127.0.0.1:8000/

Correr los tests:

```bash
python manage.py test
```

## Docker

```bash
cp .env.example .env
# Editar .env: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, etc.

docker compose up -d --build
```

El contenedor `web` corre migraciones + seed de estados automáticamente al
iniciar (`docker/entrypoint.sh`) y sirve con gunicorn en el puerto 8000.
La base de datos SQLite se persiste en `./data/db.sqlite3` (montado como
volumen).

### Exponer con Cloudflare Tunnel

El `docker-compose.yml` incluye un servicio opcional `cloudflared`:

1. Crear un tunnel en el dashboard de Cloudflare Zero Trust
   (Networks → Tunnels).
2. Configurar el "Public Hostname" del tunnel apuntando al servicio
   `web`, puerto `8000`.
3. Copiar el token del tunnel en `CLOUDFLARE_TUNNEL_TOKEN` dentro de
   `.env`.
4. `docker compose up -d`.

Si ya administras cloudflared fuera de Docker en el Steam Deck, borra el
servicio `cloudflared` de `docker-compose.yml` y apunta tu tunnel existente
a `http://localhost:8000`.

No hay autenticación en el sitio: como solo ustedes conocen la URL del
tunnel, no se implementó login. El selector "Él / Ella" es solo para saber
quién marcó cada patente, no es una medida de seguridad.

## Despliegue en el Steam Deck (SteamOS)

1. Instalar Docker (o usar Distrobox/una distro contenedora, según cómo
   tengas configurado SteamOS — al estar en modo Desktop, Docker normal
   funciona igual que en cualquier Linux).
2. Clonar el repo, copiar `.env.example` a `.env` y completarlo.
3. `docker compose up -d --build`.
4. El servicio queda corriendo en background; con `restart: unless-stopped`
   vuelve a levantarse solo si el Steam Deck se reinicia.

Para actualizar tras hacer cambios y subirlos a GitHub:

```bash
git pull
docker compose up -d --build
```

## Estructura del proyecto

```
usaplates/
├── config/                  # settings, urls, wsgi del proyecto Django
├── plates/                  # app principal
│   ├── models.py            # State, Player, Sighting
│   ├── services.py          # reglas del juego (status, setup, marcar, reset)
│   ├── avatars.py           # catálogo de caras emoji para los jugadores
│   ├── serializers.py       # DRF serializers
│   ├── views.py             # vistas de API + vista index
│   ├── urls.py
│   ├── fixtures/states.json # los 50 estados
│   ├── management/commands/
│   │   ├── seed_states.py
│   │   └── reset_game.py    # borra jugadores y patentes
│   ├── templates/plates/index.html
│   └── static/plates/
│       ├── css/style.css
│       ├── js/api.js        # cliente de la API REST
│       ├── js/map.js        # renderizado del mapa D3 + zoom/pan
│       ├── js/legend.js     # leyenda / marcador bajo el mapa
│       ├── js/setup.js      # modal inicial: cantidad, nombres y caras
│       ├── js/app.js        # orquestación, modal de estado, sincronización
│       ├── vendor/          # d3.min.js, topojson-client.min.js
│       └── data/            # states-albers-10m.json (topojson)
├── docker/entrypoint.sh
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── requirements.txt
```

## API

- `GET /api/players/` — lista de jugadores en orden (`[]` si aún no se configuran).
- `POST /api/players/` — configuración inicial:
  `{"players": [{"name": "Ana", "avatar": "🤠"}, {"name": "Beto", "avatar": "🤓"}]}`.
  Responde `409` si ya hay jugadores.
- `GET /api/states/` — lista de estados con su `status` (`none|some|all`)
  y `seen_by` (ids de los jugadores que lo vieron).
- `GET /api/states/<code>/` — detalle de un estado: `players` (cada uno con
  `seen` y sus fechas) y `first_seen`/`last_modified` combinados.
- `PUT /api/states/<code>/sightings/<player_id>/` — marca una patente como
  vista por ese jugador (idempotente).
- `DELETE /api/states/<code>/sightings/<player_id>/` — elimina la marca.

## Nota sobre la imagen de la patente en el modal

En vez de usar fotos reales de patentes de cada estado (temas de licencias
de imagen y mantenimiento de 50 archivos), el modal genera una "patente"
genérica con CSS mostrando el nombre del estado. Si más adelante quieren
reemplazarla por diseños reales por estado, basta con cambiar el bloque
`.plate` en `index.html`/`style.css` por un `<img>` por estado.
