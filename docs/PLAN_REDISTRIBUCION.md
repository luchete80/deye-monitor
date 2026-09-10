# Plan de redistribución del dashboard

## Objetivo

Reorganizar la pantalla principal para concentrar toda la información visible en
la mitad izquierda del viewport. En escritorio y en la resolución kiosk, la
mitad derecha queda libre y reservada para una ampliación futura. En pantallas
angostas, el contenido usa todo el ancho disponible para conservar legibilidad.

La columna izquierda tendrá dos zonas, en este orden:

1. Un panel superior con cuatro bloques de estado instantáneo en una grilla 2×2.
2. Un único plot inferior con las últimas 24 horas de potencia.

```text
┌──────────────── mitad izquierda ────────────────┬──── mitad derecha ────┐
│ ┌──────── Paneles ───────┐ ┌──────── Grid ────┐ │                      │
│ │ verde                  │ │ violeta          │ │                      │
│ └────────────────────────┘ └───────────────────┘ │                      │
│ ┌──────── Batería ───────┐ ┌──── UPS/Casa ────┐ │    reservada         │
│ │ celeste                │ │ amarillo         │ │                      │
│ └────────────────────────┘ └───────────────────┘ │                      │
│                                                  │                      │
│ ┌──────────── Plot de potencia 24 h ───────────┐ │                      │
│ │ generación · grid · carga batería · consumo │ │                      │
│ └──────────────────────────────────────────────┘ │                      │
└──────────────────────────────────────────────────┴──────────────────────┘
```

## Decisiones funcionales

### Layout

- El contenedor principal ocupará la mitad útil del viewport en escritorio
  (`calc(50vw - 1rem)`, compensando el padding izquierdo), alineado al borde
  izquierdo y sin centrado horizontal.
- La cabecera, los estados de conectividad, los cuatro bloques y el plot quedarán
  dentro de esa columna.
- La mitad derecha no tendrá componentes, fondos decorativos ni duplicados de
  información en esta entrega.
- A partir del breakpoint móvil definido por el proyecto, el contenedor pasará a
  `width: 100%`.
- Se eliminarán del layout visible las tarjetas de detalle actuales para evitar
  repetir los mismos datos debajo del plot. Si alguna métrica secundaria debe
  conservarse, se incorporará dentro del bloque correspondiente sin crear otra
  fila de tarjetas.

### Panel superior

Los cuatro bloques conservarán una grilla estable 2×2:

| Posición | Nombre visible | Métrica principal | Color |
|---|---|---|---|
| Arriba izquierda | Paneles | `solar.total_power_w` | Verde |
| Arriba derecha | Grid | `grid.power_w` | Violeta |
| Abajo izquierda | Batería | `battery.power_w` y SOC | Celeste |
| Abajo derecha | UPS / Casa | `load.total_power_w` | Amarillo |

- Se eliminará por completo el bloque central del inversor, incluido
  `#inverter-value`, su forma SVG y cualquier dependencia JavaScript del nodo.
- No se inventarán conexiones hacia un inversor invisible. El panel se resolverá
  como cuatro bloques de estado, no como cuatro líneas que terminan en un centro
  vacío.
- Cada bloque seguirá mostrando `Sin dato`, stale u offline según el modelo
  normalizado actual.
- Los colores se definirán como variables CSS y se compartirán entre bloques,
  leyenda y series del plot para mantener la asociación visual.
- El color no será el único indicador: cada bloque conservará nombre, valor,
  unidad y estado textual o iconográfico accesible.

### Plot inferior de 24 horas

Se reemplazarán el selector de rango, el plot de potencia actual y el plot de SOC
por un único plot uPlot que consulte siempre:

```text
GET /api/history?range=24h
```

Series requeridas:

| Serie visible | Fuente histórica | Transformación | Eje | Color |
|---|---|---|---|---|
| Generación | `pv_power_w` | Valor directo | Izquierdo, W | Verde |
| Consumo de Grid | `grid_power_w` | `max(valor, 0)` | Izquierdo, W | Violeta |
| Carga de batería | `battery_power_w` | `max(valor, 0)` | Derecho, W | Azul/celeste |
| Consumo total | `home_power_w` | Valor directo | Izquierdo, W | Amarillo |

Las transformaciones anteriores dependen de las convenciones normalizadas ya
vigentes: Grid positivo significa importación y batería positiva significa
carga. La exportación a Grid y la descarga de batería no se mostrarán en estas
dos series porque no representan los conceptos pedidos. No se aplicará valor
absoluto: hacerlo convertiría exportación o descarga en consumo o carga falsos.

- El eje izquierdo se rotulará `Potencia (W)` y será compartido por generación,
  consumo de Grid y consumo total.
- El eje derecho se rotulará `Carga batería (W)` y tendrá escala independiente.
- La leyenda mostrará los cuatro nombres completos y sus colores.
- Los huecos de adquisición seguirán representándose con `null`; nunca se
  convertirán en cero ni se unirán visualmente.
- Un rango vacío mostrará un mensaje claro y no intentará construir uPlot con
  arrays vacíos.
- El plot se redimensionará al ancho real de la columna izquierda sin volver a
  consultar la API en cada evento `resize`; se reutilizarán los datos cargados.
- uPlot continuará empaquetado localmente, sin CDN.

## Archivos previstos

- `deye_monitor/static/index.html`: nueva estructura de columna izquierda,
  grilla 2×2 y un solo contenedor de plot.
- `deye_monitor/static/style.css`: layout al 50%, breakpoint móvil, variables de
  color y estilos de bloques/ejes.
- `deye_monitor/static/app.js`: retirar el nodo inversor, preparar las cuatro
  series, configurar el segundo eje y mejorar el resize.
- `tests/test_flow_render.js`: adaptar las expectativas al panel sin inversor.
- `tests/test_flow_logic.js`: conservar las pruebas de signo y añadir las
  transformaciones de consumo/carga del historial.
- `tests/test_monitor.py`: comprobar el nuevo HTML, assets y consulta fija de
  24 h.
- `fixtures/flow/`: reutilizar los escenarios existentes y añadir sólo un
  fixture combinado si hace falta verificar simultáneamente las cuatro series.

No se prevén cambios en SQLite, en el contrato de `/api/history`, en MQTT ni en
el modelo normalizado.

## Delivery R0 — Contrato visual y semántica de datos

### Alcance

- Incorporar constantes o helpers puros para transformar Grid y batería.
- Definir las variables CSS de color:
  `--solar`, `--grid`, `--battery` y `--load`.
- Documentar en el código que sólo los valores positivos representan consumo de
  Grid y carga de batería.
- Añadir pruebas unitarias con valores positivos, negativos, cero y `null`.

### Aceptación

- Grid exportando produce `0` en la serie “Consumo de Grid”.
- Batería descargando produce `0` en “Carga de batería”.
- Un dato ausente continúa como `null`, no como `0`.
- Los cuatro colores tienen una única fuente de verdad en CSS.

## Delivery R1 — Panel superior 2×2

### Alcance

- Reemplazar el SVG central por la grilla de cuatro bloques.
- Aplicar posiciones, nombres y colores definidos en este documento.
- Eliminar el bloque del inversor y sus accesos desde JavaScript.
- Mantener valores instantáneos, SOC, frescura y estados de conexión.

### Aceptación

- Paneles está arriba a la izquierda y Grid arriba a la derecha.
- Batería está abajo a la izquierda y UPS/Casa abajo a la derecha.
- No existe un bloque, espacio reservado ni etiqueta de inversor en el centro.
- Los estados sin dato, stale y offline se entienden sin depender solamente del
  color.
- Las pruebas DOM no contienen selectores huérfanos del inversor.

## Delivery R2 — Plot único de 24 horas

### Alcance

- Eliminar el selector de rango y el plot independiente de SOC.
- Consultar `/api/history?range=24h` al cargar la página.
- Construir las cuatro series con sus transformaciones y colores.
- Configurar eje izquierdo compartido y eje derecho exclusivo de batería.
- Mantener discontinuidades reales y estado vacío.

### Aceptación

- La leyenda contiene Generación, Consumo de Grid, Carga de batería y Consumo
  total.
- La carga de batería usa la escala derecha; las otras tres series usan la
  izquierda.
- Exportación y descarga no aparecen como consumos positivos.
- Los huecos son visibles y los valores cero reales permanecen distinguibles.
- Una respuesta de hasta 17.280 muestras continúa siendo usable en Raspberry Pi
  3B y no se agrega ni compacta en el cliente.

## Delivery R3 — Layout responsive y cierre

### Alcance

- Aplicar la columna de `50vw` en escritorio/kiosk y `100%` en móvil.
- Ajustar tipografía, altura del plot y separación para que todo sea legible.
- Redimensionar uPlot usando los datos en memoria y `ResizeObserver` o un handler
  con debounce, sin refetch continuo.
- Actualizar fixtures visuales y documentación de ejecución.
- Ejecutar la suite Python y Node completa.

### Aceptación

- En escritorio, ningún contenido del dashboard cruza hacia la mitad derecha.
- En móvil no hay scroll horizontal y el contenido ocupa el ancho disponible.
- La grilla conserva el orden semántico indicado; si debe apilarse, mantiene
  Paneles → Grid → Batería → UPS/Casa.
- El plot no desborda su contenedor y conserva ambos ejes y la leyenda.
- Pasan `python3 -m pytest -q`, `node tests/test_flow_logic.js` y
  `node tests/test_flow_render.js`.

## Orden y pautas para Terra o Luna

Ejecutar `R0 → R1 → R2 → R3`. Cada delivery debe dejar el dashboard arrancable
y sus pruebas verdes antes de continuar. Terra o Luna deberá preservar los
cambios locales existentes, evitar cambios de backend fuera del alcance y no
modificar las convenciones de signo confirmadas por el modelo normalizado.

Al finalizar cada delivery:

1. Ejecutar las pruebas directamente relacionadas.
2. Revisar `git diff --check`.
3. Verificar manualmente los fixtures de importación, exportación, carga,
   descarga, stale y offline.
4. Informar archivos modificados, pruebas ejecutadas y cualquier ambigüedad que
   dependa de datos reales del inversor.
