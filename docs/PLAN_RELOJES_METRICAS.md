# Plan de relojes de potencia para las tarjetas

## Objetivo

Agregar un reloj/anillo de progreso a cada una de las cuatro tarjetas del panel
superior: Paneles, Grid, Batería y UPS / Casa. El anillo permitirá comparar la
potencia de un vistazo, conservará el color actual de cada tarjeta y contendrá
el valor numérico y la unidad en su centro.

Este cambio es exclusivamente de frontend. No requiere modificar MQTT, el
snapshot de `/api/state`, SSE, SQLite ni el historial uPlot.

## Resultado visual

Cada tarjeta reemplazará el párrafo de valor principal por un SVG accesible y
responsive con esta composición:

```text
                 12
             ╭────────╮
        9   ╱            ╲   3
           │    2.800     │
           │       W      │
            ╲            ╱
        7:30 ╰─          ─╯ 4:30
                  hueco
```

- El recorrido útil será el arco largo, en sentido horario, desde las 7:30
  hasta las 4:30: `270°` en total.
- El mínimo dejará el arco de progreso vacío en las 7:30.
- El máximo llenará el arco hasta las 4:30.
- El cuadrante inferior tendrá un hueco centrado de `90°`.
- Un track tenue mostrará siempre el recorrido completo y, sobre él, crecerá el
  arco de progreso con `--metric-color`.
- El número actual y `W` permanecerán dentro del reloj. No se duplicará el valor
  principal fuera del SVG.
- Título, estado y datos secundarios permanecerán en la tarjeta.

## Métricas, colores y escala

| Tarjeta | Valor del reloj | Tratamiento | Color existente |
|---|---|---|---|
| Paneles | `solar.total_power_w` | magnitud positiva | `--solar` verde |
| Grid | `grid.power_w` | magnitud absoluta; el número conserva el signo | `--grid` violeta |
| Batería | `battery.power_w` | magnitud absoluta; el número conserva el signo | `--battery` celeste |
| UPS / Casa | `load.total_power_w` | magnitud positiva | `--load` amarillo |

El signo de Grid y Batería seguirá comunicando dirección en el número. El anillo
representará intensidad, por lo que importación/exportación y carga/descarga con
igual potencia tendrán igual longitud. No se usará SOC para el reloj de Batería,
porque las cuatro tarjetas deben ser comparables en W; el SOC seguirá visible en
su fila secundaria.

La escala no se calculará a partir del máximo observado: hacerlo provocaría que
el reloj cambiara de significado entre actualizaciones. Se definirá una tabla
única y explícita en JavaScript, por ejemplo:

```js
const GAUGE_MAX_W = {solar: 6000, grid: 6000, battery: 6000, load: 6000};
```

`6000 W` será el valor inicial para las cuatro tarjetas, coherente con el modelo
SUN-6K documentado por el proyecto. Los máximos quedarán separados por métrica
para poder calibrarlos después sin cambiar el render. Todo valor superior se
limitará visualmente a `100%`, pero el número central continuará mostrando el
valor real completo.

## Diseño técnico

### SVG y HTML

En `deye_monitor/static/index.html`, cada `.metric-value` se convertirá en un
contenedor `.metric-gauge` con:

- un `<svg viewBox="0 0 120 120">`;
- un `<path class="metric-gauge__track">` para los 270° disponibles;
- un `<path class="metric-gauge__progress">` para el progreso;
- el `span` de valor actual y la unidad, superpuestos y centrados mediante HTML
  y CSS para conservar el formateo existente y facilitar las pruebas DOM;
- `role="img"` y un nombre accesible actualizado, sin exponer el dibujo como
  información duplicada a lectores de pantalla.

Se reutilizarán los IDs actuales (`solar-value`, `grid-value`, `battery-value` y
`load-value`) para no romper `renderMetrics()` ni selectores existentes. Cada
tarjeta tendrá un selector inequívoco para su path de progreso.

El path se definirá directamente como arco abierto, en vez de ocultar un cuarto
de un `<circle>`. Así, los extremos 7:30 y 4:30 quedan exactos y el cálculo sólo
necesita la longitud total expuesta por `pathLength="100"`:

- `stroke-dasharray: 100`;
- `stroke-dashoffset: 100 - progreso`;
- `stroke-linecap: round`;
- `fill: none`.

### Cálculo y render

En `deye_monitor/static/app.js` se agregará un helper puro:

```text
gaugePercent(value, maximum, absolute)
```

Reglas:

1. `null`, `undefined`, `NaN` o infinito producen ausencia de progreso.
2. En Grid y Batería se usa `abs(value)` sólo para el arco.
3. En Paneles y UPS / Casa, los valores negativos se limitan a cero.
4. El resultado se limita al rango `0..100`.
5. El texto central continúa usando `valueText(value)` y conserva el signo.

`renderMetrics()` actualizará en el mismo ciclo el valor, el porcentaje del
path y el nombre accesible. No habrá timers ni animaciones JavaScript. Una
transición CSS corta podrá suavizar cambios del `stroke-dashoffset`; se anulará
con `prefers-reduced-motion: reduce`.

### Estados y accesibilidad

- `unknown`: texto `Sin dato`, arco en `0%` y etiqueta accesible “Sin dato”.
- `stale`: conserva valor y arco, además del texto `Dato antiguo` ya existente;
  el SVG reducirá levemente su opacidad sin reemplazar el color de la métrica.
- `offline`: conserva el último valor recibido si existe y mantiene `Sin
  conexión`; no se inventará un cero.
- `online`: color pleno y estado `Actualizado`.
- El track tendrá contraste suficiente contra `--panel`; el color no será el
  único portador de significado porque valor, unidad y estado siguen visibles.

### Responsive

En `deye_monitor/static/style.css` el gauge usará un tamaño fluido con `clamp()`
y se centrará dentro de la tarjeta. En el breakpoint actual de `700px` se
reducirán diámetro, grosor del trazo y tipografía central. La grilla conservará
su orden y no se introducirá scroll horizontal.

## Archivos a modificar

- `deye_monitor/static/index.html`: estructura de los cuatro SVG y sus textos
  centrales.
- `deye_monitor/static/style.css`: track, progreso, colores, superposición del
  valor, estados y responsive.
- `deye_monitor/static/app.js`: configuración por tarjeta, normalización del
  porcentaje y actualización del arco/accesibilidad.
- `tests/test_flow_logic.js`: pruebas unitarias del cálculo del progreso.
- `tests/test_flow_render.js`: presencia y asociación de los cuatro gauges,
  paths, valores internos y atributos accesibles.
- `tests/test_monitor.py`: sólo si hace falta reforzar el contrato del HTML
  servido; no se cambiarán pruebas ni código de backend sin necesidad.

## Entregas para Luna

### R0 — Helper y contrato de escala

1. Agregar `GAUGE_MAX_W` y el helper puro `gaugePercent`.
2. Exportar el helper bajo el bloque CommonJS ya existente.
3. Probar cero, mitad, máximo, exceso, negativo, dato ausente y máximo inválido.

Criterios de aceptación:

- `3000 W` equivale a `50%` con máximo de `6000 W`.
- Grid o Batería a `-3000 W` muestran arco de `50%` y texto `-3.000`.
- `null` no se convierte en cero y un valor superior al máximo no supera 100%.

### R1 — Marcado SVG y estilos

1. Incorporar el mismo componente estructural en las cuatro tarjetas.
2. Dibujar el recorrido exacto 7:30 → 4:30 y aplicar `--metric-color`.
3. Centrar los valores existentes dentro de cada reloj.
4. Ajustar tamaños de escritorio y móvil, incluyendo reducción de movimiento.

Criterios de aceptación:

- Hay exactamente cuatro gauges, cada uno dentro de la tarjeta correcta.
- Los extremos y el hueco inferior coinciden en los cuatro SVG.
- Cada progreso hereda el color de su tarjeta.
- Los números no se cortan con valores de al menos cinco cifras y signo.

### R2 — Integración con datos y estados

1. Extender la tabla `metrics` de `renderMetrics()` con configuración del gauge.
2. Actualizar texto, arco y etiqueta accesible de forma atómica por snapshot.
3. Mantener sin cambios los datos secundarios, estados de frescura y SSE.

Criterios de aceptación:

- Cada evento SSE actualiza número y arco sin recrear el SVG.
- Grid y Batería conservan el signo en pantalla y usan magnitud para el arco.
- `Sin dato`, stale y offline mantienen la semántica actual.
- El historial uPlot no cambia.

### R3 — Verificación y cierre

1. Ejecutar:

   ```bash
   python3 -m pytest -q
   node tests/test_flow_logic.js
   node tests/test_flow_render.js
   git diff --check
   ```

2. Verificar visualmente los fixtures `pv_load`, `grid_import`, `grid_export`,
   `battery_charge`, `battery_discharge`, `stale` y `offline`.
3. Comprobar escritorio y un viewport móvil menor a `700px`.

Criterios de aceptación:

- Las suites Python y Node quedan verdes.
- No hay dependencias nuevas ni llamadas de red adicionales.
- No hay desbordes, valores duplicados ni regresiones en el plot de 24 horas.
- Los cuatro relojes permiten comparar magnitudes usando una escala estable.

## Fuera de alcance

- Cambiar topics MQTT, convenciones de signo o el modelo normalizado.
- Incorporar una librería de gauges.
- Convertir el reloj de Batería en indicador de SOC.
- Autoescalar con datos históricos o con el último snapshot.
- Modificar la distribución 2×2 o el espacio reservado a la derecha.

## Pautas de implementación para Luna

Implementar en orden `R0 → R1 → R2 → R3`, preservando cualquier cambio local
ajeno al trabajo. Cada entrega debe dejar las pruebas relacionadas en verde. Si
los máximos reales difieren de `6000 W`, cambiar únicamente `GAUGE_MAX_W` y
documentar la fuente de esos límites; no introducir autoescala implícita.
