# Deye Monitor — Delivery 2

Monitor web liviano para el inversor esperado **Deye SUN-6K-OG03LP1-EU-AM2** (monofásico, familia SG03LP1). Consume MQTT publicado por otro servicio; no se conecta a Modbus ni modifica, copia o incluye `deye-inverter-mqtt` ni `deye-dashboard`.

Esta entrega guarda sólo estado en memoria y ofrece Flask, HTTP, SSE y un SVG de
flujo energético. No incluye SQLite, gráficos históricos, Docker, WebSocket ni
comandos MQTT.

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
- `GET /events`: stream Server-Sent Events con evento `state`. La página carga primero la API y después escucha SSE; el navegador reconecta de forma nativa.

El snapshot incluye timestamps y frescura por campo (`field_timestamps`,
`field_freshness`), `observed_at`, y estados separados de broker, servicio MQTT,
logger y dato stale. `stale` global se calcula con los campos obligatorios de
`DEYE_FRESH_REQUIRED_FIELDS`; nunca convierte un valor ausente en cero. El total
solar permanece `null` hasta recibir PV1 y PV2.

`observed_at` es el último evento (incluye conectividad), mientras
`data_observed_at` es la última métrica. La página muestra la antigüedad relativa
de esta última, para que una reconexión no parezca una lectura nueva.

## Flujo energético

El diagrama sigue el layout Deye: PV arriba a la izquierda, Grid arriba a la
derecha, Batería abajo a la izquierda, UPS + Load abajo a la derecha e Inversor
en el centro. Sus flechas usan únicamente el modelo normalizado: Grid positivo
es importación y Batería positivo es carga. Una potencia cuyo valor absoluto no
supera `DEYE_FLOW_DEADBAND_W` (30 W por defecto) se considera inactiva. Las
animaciones se detienen si falta la métrica, queda stale o se reporta una
desconexión; también respetan `prefers-reduced-motion`.

La frescura se evalúa para cada conexión: un dato viejo de Grid no detiene una
flecha de Batería que aún esté fresca. Una desconexión de broker (en MQTT),
servicio o logger sí detiene todas las animaciones. La zona muerta no muestra
flechas, pero mantiene la potencia visible; al cruzar de un signo a otro debe
pasar por ese intervalo inactivo, evitando un cambio de dirección instantáneo.

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

Abrí `http://127.0.0.1:5000`. El modo simulado se identifica como tal y puede
animar flujos aunque no exista un broker MQTT. Para el fixture `stale`, usá el
mismo comando con `SCENARIO=stale DEYE_STALE_AFTER_SECONDS=-1`; las líneas se
verán ámbar, sin animación y con la leyenda “antiguo”.

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
