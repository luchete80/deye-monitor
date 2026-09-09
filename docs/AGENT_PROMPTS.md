# Prompts de ejecución para Terra y Luna

## Cómo usarlos

Cada prompt corresponde a una entrega cerrada. Debe ejecutarse en orden y en una
rama o sesión controlada. El agente tiene que leer primero `README.md`,
`docs/PLAN.md` y `docs/MQTT_MAPPING.md`. No debe modificar
`deye-inverter-mqtt/` ni `deye-dashboard/`.

Terra se asigna a trabajo arquitectónico, persistencia e integración. Luna se
asigna a tareas acotadas de interfaz, tests, fixtures y documentación. No se
deben ejecutar dos prompts que editen los mismos archivos simultáneamente.

## Delivery 0 — Terra: captura y contrato MQTT

```text
Trabajá solamente en /home/weldform-pc/Numerico/deye/deye-monitor.
Leé README.md, docs/PLAN.md y docs/MQTT_MAPPING.md completos. Inspeccioná en modo
solo lectura deye-inverter-mqtt para conocer configuración, grupos y topics.

Prepará las herramientas y documentación de Delivery 0 para inventariar MQTT:
- un capturador reproducible que se suscriba al prefijo configurado y escriba
  JSON Lines con topic, payload y timestamps monotónico y de pared;
- configuración por argumentos o entorno, sin guardar credenciales;
- instrucciones para capturar estados físicos y probar retained/reconexiones;
- análisis resumible de frecuencia, duplicados y separación temporal de topics.

No supongas que hay acceso al inversor. Si no lo hay, dejá el procedimiento listo
y mantené los campos como VALIDAR. No implementes el dashboard. Agregá tests del
parser/análisis usando fixtures sintéticos, ejecutalos y reportá resultados.
No modifiques los repositorios vecinos.
```

## Delivery 0 — Luna: revisión del inventario

```text
Revisá los artefactos de Delivery 0 en deye-monitor como una tarea de solo
lectura salvo correcciones documentales pequeñas. Contrastá MQTT_MAPPING.md con
los archivos docs/metric_group_* y src/deye_sensors_* de deye-inverter-mqtt.
Buscá topics inexistentes, unidades erróneas, campos ambiguos y afirmaciones de
retained no respaldadas. Verificá que SG03LP1 y SG04LP3 no se mezclen.
Entregá una lista priorizada de hallazgos y corregí únicamente errores ciertos
en la documentación o tests. No inventes convenciones de signo.
```

## Delivery 1 — Terra: backend vertical

```text
Implementá exactamente Delivery 1 de docs/PLAN.md dentro de deye-monitor.
Antes de editar, verificá que Delivery 0 haya confirmado los topics esenciales;
si no están confirmados, detenete y reportá el bloqueo sin fijar signos por
suposición.

Creá una aplicación Flask modular con cliente MQTT, adaptador configurable,
estado en memoria y timestamps por campo. Implementá GET /health,
GET /api/state y SSE en GET /events. La reconexión MQTT debe ser segura y un
payload inválido no debe borrar el último valor válido. No agregues SQLite,
plots, WebSocket ni comandos MQTT. Incluí .env.example, dependencias fijadas,
tests unitarios y de integración sin broker externo. Ejecutá tests y documentá
cómo iniciar el servicio. No modifiques los repositorios vecinos.
```

## Delivery 1 — Luna: tarjetas y estados

```text
Sobre una Delivery 1 backend ya funcional, implementá solamente la página de
estado en vivo y sus tests de frontend razonables. Creá cuatro tarjetas: Solar,
Batería, Red y Casa, más indicadores separados de broker, servicio MQTT, logger
y frescura. Consumí primero /api/state y luego /events. Tratá null como
desconocido, no como cero. La interfaz debe sobrevivir a desconexión/reconexión
SSE y ser usable en la resolución kiosk documentada. No agregues SVG de flujo,
plots, frameworks SPA ni dependencias CDN. Conservá JS y CSS en archivos
separados. Ejecutá las verificaciones disponibles y reportá cambios.
```

## Delivery 2 — Luna: SVG de flujo

```text
Implementá exactamente Delivery 2 de docs/PLAN.md sobre la Delivery 1 aceptada.
Creá un SVG responsive para Solar, Inversor, Batería, Red y Casa. Las direcciones
deben depender sólo del modelo normalizado confirmado. Usá zona muerta
configurable, detené animaciones con datos stale/offline y respetá
prefers-reduced-motion. No recalcules potencias ni deduzcas signos desde nombres
de topics en el frontend. Agregá fixtures/escenarios para reposo, importación,
exportación, carga, descarga y stale. No agregues historial ni plots.
```

## Delivery 2 — Terra: revisión semántica

```text
Revisá la Delivery 2 centrándote en corrección energética y transiciones de
estado. Compará cada flecha con MQTT_MAPPING.md confirmado y los fixtures reales
de Delivery 0. Detectá inversión de signos, parpadeo cerca de cero, estados
imposibles y uso accidental de valores stale. Corregí problemas dentro de
deye-monitor, agregá tests de regresión y no amplíes alcance visual.
```

## Delivery 3 — Terra: SQLite y API histórica

```text
Implementá exactamente la parte backend de Delivery 3. Diseñá SQLite con
migraciones, snapshots coherentes cada 5 s, transacciones, retención y
compactación. No insertes una fila por mensaje MQTT. Preservá null/huecos y
guardá suficiente información de calidad/frescura. Implementá
GET /api/history?range=... con validación y límites. Incluí pruebas de reinicio,
concurrencia, datos parciales, agregación, retención y migración. Medí una
consulta sintética de 24 h. No implementes todavía extras ni escritura MQTT.
```

## Delivery 3 — Luna: plots uPlot

```text
Sobre la API histórica aceptada, integrá uPlot empaquetado localmente, sin CDN.
Creá un gráfico combinado de PV, casa, batería y red y otro de SOC. Mostrá huecos
como huecos, signos de batería/red de forma legible y unidades correctas. Permití
los rangos soportados por la API sin descargar puntos innecesarios. Priorizá
fluidez en Raspberry Pi 3B y accesibilidad básica. No cambies el esquema SQLite
ni agregues nuevas métricas. Documentá y probá los transformadores de datos.
```

## Delivery 4 — Terra: despliegue

```text
Implementá Delivery 4 completa sin incluir una copia de Mosquitto ni de
deye-inverter-mqtt dentro de la imagen. Creá Dockerfile y Compose para conectar
deye-monitor a un broker existente por hostname/red configurables. Añadí volumen
SQLite, healthcheck, restart policy, usuario sin privilegios y .env.example sin
secretos. Documentá Raspberry Pi 3B y Chromium kiosk. Probá arranque sin broker,
reconexión y persistencia tras reinicio. El contenedor no debe necesitar acceso
al IP/puerto Modbus del inversor. Ejecutá todas las pruebas y entregá comandos de
verificación reproducibles.
```

## Delivery 4 — Luna: documentación de operación

```text
Validá la documentación de instalación de Delivery 4 desde la perspectiva de un
checkout limpio. Revisá variables, nombres de red Docker, persistencia,
healthcheck, actualización y kiosk. Corregí pasos incompletos o inconsistentes y
agregá una sección de diagnóstico para broker caído, logger offline, dato stale
y base de datos no escribible. No cambies la arquitectura ni agregues servicios.
```

## Prompt de cierre de cada entrega

```text
Auditá la entrega contra su sección exacta de docs/PLAN.md. Ejecutá todos los
tests pertinentes, revisá git diff y confirmá que no haya cambios fuera de
deye-monitor. Reportá: criterios cumplidos, criterios pendientes, comandos y
resultados de prueba, riesgos residuales y archivos modificados. No declares la
entrega completa si queda un criterio sin evidencia.
```
