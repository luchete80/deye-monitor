# Plan para Luna: tablero, vúmetros y acumulados de energía

## Objetivo y alcance

Actualizar el tablero con cuatro relojes (Sol, Red, Batería y Casa), máximos configurables, números legibles, energía acumulada y gráficos de las últimas 24 horas. Este documento es un encargo de implementación; no implica ejecutar cambios todavía.

Usar este plan como especificación vigente cuando contradiga los planes anteriores de `docs/`. Mantener los sensores de temperatura y el flujo energético entre las cuatro tarjetas.

## Estado actual que debe tener en cuenta Luna

- `deye_monitor/static/app.js` tiene máximos de potencia fijos de 6000 W y batería en SOC (%).
- `deye_monitor/static/index.html` contiene el cuadrado central `Inv`, corrientes secundarias y textos de estado encima del tablero y los gráficos.
- El gráfico de potencia usa el día calendario; el de temperatura ya dispone de funciones para una ventana móvil.
- `deye_monitor/config.py` carga configuración desde `.env`; los tamaños visuales están en `deye_monitor/static/config.css`.
- `deye_monitor/history.py` conserva por defecto 24 horas y sólo guarda potencia cuando todos los campos del snapshot están completos y frescos. Eso no alcanza para acumulados mensuales ni debe impedir contabilizar Casa si falta otro sensor.
- Ya existen tensión de Red y contadores diarios de energía comprada/vendida. No hay contadores diarios de Casa y Sol en el estado actual.

## 1. Configuración en archivo

Extender `.env`, `Config` y `.env.example`, aprovechando la configuración existente. Publicar al frontend únicamente los parámetros de visualización y cálculo necesarios mediante un contrato explícito de API; nunca credenciales MQTT.

| Parámetro propuesto | Uso / valor inicial |
|---|---|
| `DEYE_GAUGE_SOLAR_MAX_W` | Máximo de potencia solar; 6000 W como valor inicial existente |
| `DEYE_GAUGE_GRID_MAX_W` | Máximo de potencia de Red; 6000 W |
| `DEYE_GAUGE_LOAD_MAX_W` | Máximo de potencia de Casa; 6000 W |
| `DEYE_HOME_DAY_SCALE_KWH` | Escala inicial del acumulado diario de Casa; 6 kWh |
| `DEYE_HOME_DAY_SCALE_NEXT_KWH` | Segunda escala del acumulado; 12 kWh |
| `DEYE_SOLAR_CAPACITY_W` | Capacidad instalada de producción solar; cargar valor real |
| `DEYE_BATTERY_USABLE_KWH` | Capacidad útil entre SOC mínimo y máximo; cargar valor real |
| `DEYE_BATTERY_SOC_MIN_PCT` | Límite inferior; 25 % |
| `DEYE_BATTERY_SOC_MAX_PCT` | Límite superior; 95 % |
| `DEYE_BILLING_DAY` | Día de inicio del ciclo de facturación; cargar valor real |
| `DEYE_TIMEZONE` | Zona de días y meses; `America/Argentina/Buenos_Aires` |
| `DEYE_GRID_ABSENT_BELOW_V` | Umbral configurable para considerar ausencia de tensión |
| `DEYE_ALERT_BEEP_ENABLED` | Sonido opcional; desactivado inicialmente |

Validar valores finitos, capacidades y escalas positivas, mínimo < máximo, SOC entre 0 y 100 y día de facturación entre 1 y 31. Para días inexistentes en un mes, usar su último día. Documentar que los cambios requieren reiniciar el servicio, salvo que se implemente recarga explícita.

La capacidad solar instalada y el máximo visual son conceptos diferentes: permitir que el máximo del reloj use la capacidad instalada cuando no haya una configuración visual específica. No inventar capacidad de batería ni día de facturación.

## 2. Limpieza y distribución visual

- Quitar el inversor y su cuadrado central de la pantalla. Ajustar las flechas para que no terminen en un elemento eliminado y conserven el sentido de los flujos.
- Quitar los comentarios/textos superiores a los relojes. Mantener una indicación compacta de conexión o datos vencidos que no ocupe esa franja.
- Separar horizontalmente los relojes: columna izquierda junto al marco izquierdo y columna derecha junto al derecho, con margen interno consistente y sin recortes.
- Aumentar el tamaño del número principal y probarlo en blanco; conservar colores de los arcos para distinguir métricas.
- Distribuir los datos secundarios pequeños arriba y abajo del valor principal, sin superposición con el arco. Deben seguir siendo legibles.
- Quitar las corrientes de Sol, Red y Casa de la vista y de sus etiquetas accesibles.
- Quitar los conteos de “muestras” y “lecturas” de los plots. Conservar estados de carga, error y ausencia de datos cuando correspondan.
- Revisar el espacio inferior de los plots, ejes y leyendas; evitar márgenes vacíos excesivos y etiquetas recortadas.

## 3. Contenido de cada reloj

Propuesta de composición: potencia instantánea al centro para Sol, Red y Casa; SOC al centro para Batería. Los acumulados son datos secundarios. La escala 6 → 12 corresponde a energía diaria de Casa, no a potencia en W. Si se quiere convertir Casa en un reloj principal de energía, confirmar esa decisión antes de cambiar la magnitud del arco.

| Reloj | Centro | Arriba | Abajo |
|---|---|---|---|
| Sol | Potencia actual W/kW | Producción del día, kWh | Capacidad solar configurada |
| Red | Potencia actual W/kW, con dirección | Tensión, V | Importación acumulada del ciclo de facturación, kWh |
| Casa | Potencia actual W/kW | Consumo del día calendario, kWh | Consumo del mes calendario, kWh |
| Batería | SOC, % | Energía útil disponible, kWh | `Rem:` tiempo hasta mínimo o máximo según descarga/carga |

En Casa, mostrar el acumulado diario con escala inicial de 6 kWh; al superar 6, pasar a 12. Si supera 12, ampliar por múltiplos de 6 para evitar saturación permanente. Reiniciar la escala al comenzar el siguiente día. El número siempre muestra el valor real.

Para Red sin tensión, tachar “Red” o mostrar “Sin tensión” con señal visual inequívoca. Sólo hacerlo con una lectura válida y fresca por debajo del umbral; dato ausente o vencido significa “Sin dato”, no corte de red.

Usar `kWh` para energía, `kW` para potencia y `V` para tensión; interpretar “kW/hora” de las notas como energía acumulada en kWh.

## 4. Alertas de SOC y tiempo restante

- SOC ≤ mínimo (25 % inicialmente): titilar sólo si la batería **no está cargando**, con estado conocido y fresco; incluye reposo y descarga.
- SOC ≥ máximo (95 % inicialmente): titilar sólo mientras la batería **está cargando**, con estado conocido y fresco.
- Calcular carga/descarga con la convención de signo ya normalizada y el deadband existente. No deducir carga de la corriente sin validar el signo.
- Quitar el titileo inmediatamente si deja de cumplirse la condición. No activar alertas con SOC o potencia vencidos/desconocidos.
- Si se incorpora beep, habilitarlo con acción del usuario por las restricciones de audio del navegador. Emitirlo al entrar en alerta, evitando uno por cada actualización. Respetar silencio y movimiento reducido.

Definir `C_util` como los kWh utilizables entre los SOC configurados `S_min` y `S_max`:

```text
fracción = limitar((SOC - S_min) / (S_max - S_min), 0, 1)
energía disponible = C_util × fracción
energía para alcanzar máximo = C_util × (1 - fracción)
tiempo de descarga [h] = energía disponible [kWh] / potencia de descarga [kW]
tiempo de carga [h] = energía para alcanzar máximo [kWh] / potencia de carga [kW]
```

Estos kWh se calculan a partir del SOC, como se pidió. No confundirlos con consumo acumulado: Casa, Sol y Red requieren sus propias mediciones. Mostrar el tiempo como estimación (`Rem: ~2 h 15 min`); en reposo, falta de datos o potencia cerca de cero, mostrar `Rem: —`. Usar potencia suavizada para reducir saltos y no asumir rendimientos desconocidos.

## 5. Acumulados diarios, mensuales y de facturación

Implementar contabilidad persistente en SQLite independiente de la retención de los plots:

- Casa: consumo del día calendario y del mes calendario actual. Mostrar también el último mes calendario cerrado, claramente identificado, para cubrir “consumo último mes”.
- Sol: producción del día calendario.
- Red: energía **importada** desde el comienzo del ciclo de facturación configurado. Mantener exportación separada; no restarla sin un pedido explícito de saldo neto.
- Agregar un botón de reset al acumulado mensual de Casa, como interpretación inicial de “energía consumida en el mes, con botón de reset”. Mostrar desde qué fecha se cuenta luego del reset.
- El reset debe guardar una base persistente, sin borrar muestras ni acumulados diarios o históricos. Mantener disponible el total calendario real y distinguirlo del contador reiniciado.

Para los cálculos, priorizar contadores del equipo cuando existan y sean válidos; manejar medianoche, reinicio del equipo y saltos del contador. Para Casa y Sol, integrar potencia fresca con el tiempo transcurrido (`kWh = ∫ W dt / 3.600.000`, con tiempo en segundos). Separar importación y exportación antes de integrar Red y tratar los cruces por cero.

Contabilizar cada métrica independientemente. No integrar intervalos largos sin datos ni rellenarlos con cero. Informar cobertura incompleta y conservar los acumulados al reiniciar el servicio. Partir intervalos en los límites de día, mes y facturación según la zona configurada.

Crear una migración aditiva de SQLite y definir el contrato de API para acumulados y reset. No se pueden reconstruir meses anteriores a partir de sólo 24 h de historial: mostrar “Sin historial suficiente” y comenzar a acumular desde la implementación, salvo que exista una fuente verificable para importar datos.

## 6. Plots de las últimas 24 horas

- Usar en ambos gráficos el rango móvil `[ahora - 24 h, ahora]`, actualizado con cada refresco; dejar de fijar potencia entre medianoche y medianoche siguiente.
- Filtrar en backend también el límite superior para excluir muestras futuras.
- Etiquetar horas reales locales y el cambio de fecha cuando corresponda; no usar índices como si fueran horas del día.
- Mantener unidades y escalas correctas para potencia, SOC y temperatura. Revisar qué representa cada serie actual antes de modificarla.
- Marcar huecos sin lecturas para evitar líneas continuas que simulen mediciones.
- Los acumulados diarios se calculan en backend; no deben depender de las muestras visibles de las últimas 24 h.
- No reemplazar datos reales ausentes por demos sin indicación visible. Los demos deben quedar identificados aunque se elimine el texto del número de muestras.

## 7. Orden de implementación y archivos

1. **Contrato y configuración:** `deye_monitor/config.py`, `.env.example`, `deye_monitor/app.py` y README. Definir unidades, valores pendientes y respuesta de configuración pública.
2. **Contabilidad persistente:** ampliar `deye_monitor/history.py` o crear un módulo dedicado de energía; conectar recepción/registro de datos, migraciones, agregados y reset. Revisar `state.py` y `adapter.py` sólo donde haga falta.
3. **Métricas derivadas:** energía por SOC, tiempo restante, estado de Red y alertas, con frescura y convención de signos existentes.
4. **Frontend:** `static/index.html`, `static/app.js`, `static/style.css` y `static/config.css`; composición de tarjetas, máximos, textos y escalas.
5. **Historial:** rango móvil de potencia y temperatura, huecos, etiquetas y espacios.
6. **Verificación y documentación:** actualizar pruebas relevantes en `tests/test_monitor.py`, `tests/test_flow_logic.js` y `tests/test_flow_render.js`, según lo modificado; documentar instalación/configuración y limitaciones del historial inicial.

## 8. Criterios de aceptación

- Cambiar un máximo en `.env` modifica el reloj tras reiniciar, sin editar JavaScript. Valores fuera de escala conservan el número real y limitan el arco.
- No aparece el inversor, las corrientes de Sol/Red/Casa, los comentarios superiores ni los conteos de muestras.
- Números blancos y más grandes; secundarios arriba/abajo; relojes junto a sus marcos. Verificar escritorio, pantalla baja y móvil, sin solapamientos ni recortes.
- Probar SOC 24, 25, 26, 94, 95 y 96 en carga, descarga, reposo y datos vencidos: titileo exclusivamente en las condiciones especificadas.
- Validar el cálculo por SOC en mínimo, punto medio y máximo, y tiempos de carga/descarga con potencias conocidas; reposo muestra `—`.
- Probar Red con tensión normal, cero y lectura vencida: distinguir suministro ausente de dato desconocido.
- Con 1 kW constante durante una hora válida, el acumulado es 1 kWh. Verificar huecos, medianoche, cambio de mes, ciclo de facturación, febrero y días 29–31.
- Casa cambia su escala diaria al superar 6 kWh y sigue representando valores superiores a 12; el cambio no altera los kWh ni la potencia.
- Reiniciar el proceso conserva acumulados y reset. El reset no borra históricos ni cambia el contador de Red.
- Ambos plots muestran exactamente la ventana de las últimas 24 h, incluso al cruzar medianoche, sin datos futuros ni demos confundidos con datos reales.

## Decisiones a confirmar sin frenar tareas independientes

1. Capacidad útil real de batería entre 25 % y 95 %, capacidad solar instalada y día de facturación.
2. Si “Casa al superar 6” requiere que el arco principal represente kWh diarios en lugar de potencia: este plan propone conservar potencia y agregar escala al acumulado.
3. Si “último mes” significa últimos 30 días móviles: este plan propone mes actual más último mes calendario cerrado.
4. Si el botón de reset corresponde a Casa o Red: este plan lo asigna a un contador mensual de Casa separado del total calendario.
5. Si se desea beep: implementar primero alerta visual; sonido opcional apagado por defecto.
