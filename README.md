# Deye Monitor — Delivery 3

Monitor web liviano para el inversor esperado **Deye SUN-6K-OG03LP1-EU-AM2** (monofásico, familia SG03LP1). Consume MQTT publicado por otro servicio; no se conecta a Modbus ni modifica, copia o incluye `deye-inverter-mqtt` ni `deye-dashboard`.

Además del estado en memoria, esta entrega mantiene un historial SQLite local y
un plot uPlot empaquetado en el proyecto; no depende de una CDN. La interfaz usa
un área configurable, con cuatro bloques 2×2 y un plot inferior.
No incluye Docker, WebSocket ni comandos MQTT.

## Ejecutar deye-inverter-mqtt en WSL

`deye-inverter-mqtt` no está clonado como repositorio local: se ejecuta desde
la imagen Docker `ghcr.io/kbialek/deye-inverter-mqtt`. Su configuración está en
`/home/luciano/deye-test/config.env`.

Para ejecutarlo en primer plano y ver su salida directamente:

```bash
cd ~/deye-test
sudo docker run --rm \
  --network host \
  --env-file config.env \
  ghcr.io/kbialek/deye-inverter-mqtt
```

Se detiene con `Ctrl+C`. Si ya existe el contenedor persistente `deye-mqtt`, se
puede iniciar y seguir sus logs con:

```bash
sudo docker start deye-mqtt
sudo docker logs -f deye-mqtt
```

Para comprobar si el contenedor existe y consultar su estado:

```bash
sudo docker ps -a --filter name=deye-mqtt
```

## Ejecución local

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
# editar .env: DEYE_DATA_SOURCE=simulated
python -m deye_monitor
```

Abrir `http://127.0.0.1:5000`. El modo `simulated` reproduce el fixture elegido por `DEYE_FIXTURE`, en un hilo distinto del cliente MQTT. El modo `mqtt` usa paho-mqtt y reconecta con `connect_async`/`loop_start`; sus callbacks sólo adaptan el mensaje y actualizan el estado protegido por lock.

Para pruebas: `pytest`.

## API

- `GET /health`: proceso vivo, estado del broker y frescura.
- `GET /api/state`: snapshot normalizado; campos no recibidos son `null`.
- `GET /api/history?range=1h|6h|12h|24h`: muestras históricas completas, en
  orden cronológico y nunca anteriores a la ventana conservada.
- `GET /events`: stream Server-Sent Events con evento `state`. La página carga primero la API y después escucha SSE; el navegador reconecta de forma nativa.

El snapshot incluye timestamps y frescura por campo (`field_timestamps`,
`field_freshness`), `observed_at`, y estados separados de broker, servicio MQTT,
logger y dato stale. `stale` global se calcula con los campos obligatorios de
`DEYE_FRESH_REQUIRED_FIELDS`; nunca convierte un valor ausente en cero. El total
solar permanece `null` hasta recibir PV1 y PV2.

`observed_at` es el último evento (incluye conectividad), mientras
`data_observed_at` es la última métrica. La página muestra la antigüedad relativa
de esta última, para que una reconexión no parezca una lectura nueva.

## Historial

Cada `DEYE_HISTORY_INTERVAL_SECONDS` (5 por defecto) se toma una copia del
estado actual en una transacción SQLite. Se almacena sólo si PV total, carga,
potencia de batería, potencia de red y SOC existen y siguen frescos; un estado
parcial no se convierte en ceros ni se registra como una muestra válida. La base
se versiona con `PRAGMA user_version` y se guarda en `DEYE_HISTORY_DB_PATH`
(`data/deye-monitor.sqlite3` por defecto).

La limpieza corre con cada ciclo y conserva únicamente las últimas
`DEYE_HISTORY_RETENTION_HOURS` (24 por defecto). Por eso un reinicio conserva
las muestras dentro de esa ventana y una consulta de 24 h no puede exponer datos
expirados. Cuando falta una muestra, los gráficos reciben un hueco (`null`), no
una lectura de 0 W.

## Interfaz y plot

### Tamaño de pantalla

El tamaño y la fuente del tablero se configuran en
`deye_monitor/static/config.css`:

```css
:root{
  --dashboard-width:1024px;
  --dashboard-height:600px;
  --dashboard-font-size:12px;
  --dashboard-gauges-width:50%;
}
```

Los valores predeterminados corresponden a una pantalla de 1024×600. El tamaño
efectivo nunca supera el espacio disponible, por lo que también se adapta a
pantallas más chicas. Para achicar o agrandar todos los textos, cambiar
`--dashboard-font-size`. Después de modificarlo, recargar el navegador con
`Ctrl+F5` si todavía muestra el CSS anterior.

`--dashboard-gauges-width` limita sólo el bloque de los cuatro relojes. Con
`50%` ocupa como máximo la mitad del ancho real del tablero (512 px cuando el
tablero mide 1024 px); el gráfico inferior sigue usando todo el ancho.

En la pantalla se muestran Paneles arriba a la
izquierda (verde), Grid arriba a la derecha (violeta), Batería abajo a la
izquierda (celeste) y UPS / Casa abajo a la derecha (amarillo). No se muestra un
bloque central del inversor. El conjunto 2×2 conserva una proporción cuadrada y
se centra dentro del ancho configurado para que las tarjetas no se ensanchen y las
flechas mantengan su posición relativa. El plot sí usa todo el ancho disponible.
En móvil la columna pasa a ocupar todo el ancho.

El plot consulta el historial de 24 horas, pero su eje de tiempo queda fijo al
día calendario local actual, desde las 0 hasta las 24 h, con marcas horarias
fijas. Generación,
Consumo de Grid y Consumo total usan el eje izquierdo en W. El porcentaje de
carga de batería usa el eje derecho, con escala fija de 0 a 100 %. Los valores
cero no se dibujan: se muestran como huecos para evitar los pulsos transitorios
del logger. Un valor ausente también sigue siendo un hueco (`null`). Las lecturas transitorias en las que
todas las potencias y el SOC llegan simultáneamente en cero se consideran
inválidas y se dibujan como un hueco; los ceros individuales legítimos se
conservan.

La serie amarilla de consumo requiere un valor estrictamente mayor que cero;
los ceros y valores negativos inválidos se omiten. El gráfico no inventa datos
anteriores al inicio del historial: si el servicio comenzó al mediodía, la mitad
izquierda del día queda vacía.

La frescura se evalúa por bloque y se muestra como “Actualizado”, “Dato antiguo”,
“Sin conexión” o “Sin dato”.

### Escenarios visuales reproducibles

Los fixtures siguientes son datos sintéticos de interfaz, no evidencia del
inversor real. Con el entorno virtual activo, elegí uno de
`pv_load`, `grid_import`, `grid_export`, `battery_charge`,
`battery_discharge`, `deadband` u `offline` y ejecutá:

```bash
export SCENARIO=pv_load
DEYE_DATA_SOURCE=simulated \
DEYE_FIXTURE="fixtures/flow/${SCENARIO}.json" \
DEYE_TOPIC_GRID_POWER=ac/grid_power \
DEYE_GRID_POWER_SIGN=import_positive \
DEYE_TOPIC_BATTERY_POWER=battery/power \
DEYE_BATTERY_POWER_SIGN=charge_positive \
DEYE_TOPIC_UPS_LOAD_POWER=ac/ups/total_power \
python -m deye_monitor
```

Abrí `http://127.0.0.1:5000`. El modo simulado se identifica como tal. Para el
fixture stale, ejecutá explícitamente antes del comando anterior:

```bash
export SCENARIO=stale
export DEYE_STALE_AFTER_SECONDS=-1
```

Los bloques y el encabezado mostrarán el estado “Dato antiguo”.

## Configuración y validación pendiente (Delivery 0)

Copiar `.env.example` a `.env`. Todos los suffixes, prefijo, umbral stale y credenciales MQTT son configurables allí. El adaptador inicial cubre `dc/pv1/power`, `dc/pv2/power`, `ac/l1/voltage`, `ac/daily_energy_bought`, `ac/daily_energy_sold`, `ac/total_power`, `radiator_temp` y `ac/temperature`.

No se infieren SOC, potencia/estado de batería, consumo UPS + Load ni potencia de red. `ac/total_power` queda como diagnóstico del inversor, no como carga ni red. Sólo se puede habilitar potencia de red/batería con sus variables de topic y una convención explícita (`import_positive`/`export_positive`, `charge_positive`/`discharge_positive`); con `unknown` no se publica un valor. El topic de salida se habilita por separado con `DEYE_TOPIC_UPS_LOAD_POWER`, una vez confirmado en Delivery 0.

Las convenciones de signo son estrictas: un valor distinto de esos conjuntos
detiene el arranque con un error de configuración, en lugar de interpretar una
potencia ambiguamente.

Antes de conectar al inversor real se debe validar y documentar: existencia y unidades de cada topic, prefijo y nivel de logger, payload/retained, frecuencia real y umbral stale, significado de `status` y `logger_status`, y signos de potencia de red/batería durante importación, exportación, carga y descarga. Los fixtures `grid_*_hypothesis.json` son hipótesis de signo, no evidencia.

## Fixtures

`fixtures/` contiene estados iniciales, producción PV, importación/exportación
hipotéticas, mensajes fragmentados, logger offline y datos stale. Para ejecutar
los fixtures de red hay que configurar explícitamente
`DEYE_TOPIC_GRID_POWER=ac/grid_power_unvalidated` y una convención de signo;
esa configuración sigue siendo una hipótesis sintética. Son entradas de
desarrollo y tests, no una captura física de Delivery 0.
