# Plan de implementación

## Objetivo

Construir un dashboard local y apto para Raspberry Pi 3B que consuma los datos
de `deye-inverter-mqtt`, muestre el estado energético en vivo y mantenga un
historial útil sin volver a consultar físicamente el inversor.

## Principios y límites

- Los repositorios `deye-inverter-mqtt` y `deye-dashboard` permanecen intactos.
- `deye-inverter-mqtt` es el único dueño de la conexión TCP/Modbus al logger.
- Mosquitto es el límite entre adquisición y presentación.
- El dashboard es de solo lectura durante las primeras entregas.
- Ninguna convención de signo se considera confirmada hasta observar el equipo.
- Se comienza con `DEYE_DATA_READ_INTERVAL=5`; 1 segundo requiere una prueba de
  carga y frescura antes de aceptarse.
- Cada entrega debe poder probarse independientemente y dejar el proyecto en un
  estado funcional.

## Estrategia de frecuencia

MQTT no hace que el logger mida más rápido: distribuye las lecturas obtenidas por
TCP/Modbus. `deye-inverter-mqtt` es preferible al lector de `deye-dashboard`
porque agrupa rangos de registros y desacopla adquisición y consumidores.

La progresión de prueba será:

1. 5 s con todos los grupos imprescindibles.
2. 2 s si no aparecen timeouts ni ciclos cuya duración exceda el intervalo.
3. 1 s solamente con métricas rápidas y después de comprobar que los valores
   realmente cambian; consultar cada segundo no garantiza muestras nuevas.

Se registrarán duración de ciclo, errores, reconexiones, porcentaje de valores
repetidos y edad de la última actualización. No se cambiará de intervalo por
intuición.

## Delivery 0 — Verificación del contrato MQTT

### Alcance

- Identificar modelo de inversor, protocolo y `DEYE_METRIC_GROUPS` activos.
- Capturar durante al menos 10 minutos todos los topics bajo el prefijo elegido.
- Repetir una parte de la captura provocando, si es seguro, carga/descarga de
  batería e importación/exportación de red.
- Comprobar payload, unidad, signo, frecuencia, orden de llegada y duplicados.
- Verificar `status`, `logger_status`, reconexión y comportamiento sin logger.
- Determinar qué mensajes son retained mediante una suscripción nueva.
- Completar `MQTT_MAPPING.md` con evidencia observada.
- Comparar 5 s y, si el sistema es estable, 2 s. La prueba a 1 s es opcional y
  se limita a los grupos mínimos.

### Entregables

- Captura reproducible de topics sin secretos.
- `docs/MQTT_MAPPING.md` confirmado o con incógnitas explícitas.
- Nota de resultados con intervalo recomendado y criterio de dato stale.

### Aceptación

- Cada valor necesario para las cuatro tarjetas tiene topic y unidad.
- Los signos de red y batería están comprobados en dos estados opuestos.
- Está documentada la diferencia entre servicio MQTT online, logger online y
  dato fresco.
- No se ha modificado ninguno de los dos repositorios de referencia.

## Delivery 1 — Estado en vivo vertical

### Alcance

- Crear el esqueleto Python, configuración `.env.example` y tests.
- Suscribirse solamente a los topics confirmados.
- Normalizar mensajes en un modelo interno independiente del modelo Deye.
- Mantener estado en memoria con timestamps por campo y timestamp de snapshot.
- Exponer `GET /health`, `GET /api/state` y `GET /events` mediante SSE.
- Crear una página simple con tarjetas Solar, Batería, Red y Casa.
- Mostrar broker, logger, frescura del dato y última actualización.

### No incluido

SQLite, plots, SVG animado, controles del inversor y extras del dashboard viejo.

### Aceptación

- La página recupera el estado al abrirse y continúa por SSE.
- Una reconexión MQTT no requiere recargar la página.
- Un campo ausente se representa como desconocido, nunca como cero inventado.
- Los datos viejos quedan visualmente marcados y las pruebas cubren parsing,
  signos normalizados y transiciones online/offline.

## Delivery 2 — Diagrama de flujo energético

Estado: completado.

### Alcance

- SVG responsive basado en la disposición de los diagramas Deye, con el
  inversor como nodo central y cuatro bloques alrededor suyo:

  ```text
  PV ───────────────► Inversor ◄──────────────► Grid
                            │
                 Batería ◄──┴──► UPS + Load
  ```

  En el layout, PV ocupa la esquina superior izquierda, Grid la superior
  derecha, Batería la inferior izquierda y UPS + Load la inferior derecha.
  En pantallas angostas se puede reordenar visualmente sin cambiar estas
  relaciones ni confundir el origen y destino de los flujos.
- Mantener la terminología visible `PV`, `Grid`, `Batería` y `UPS + Load`; no
  reemplazar UPS + Load por una Casa genérica en este diagrama.
- Dibujar las conexiones y flechas correspondientes: PV → Inversor;
  Inversor ↔ Grid para importación/exportación; Inversor ↔ Batería para
  carga/descarga; e Inversor → UPS + Load para el consumo de las cargas.
- Mostrar potencia instantánea junto a cada conexión.
- Calcular dirección desde el modelo normalizado, no desde topics crudos.
- Aplicar una zona muerta configurable, inicialmente 30 W.
- Detener animaciones cuando el dato esté stale u offline.
- Respetar `prefers-reduced-motion`.

### Aceptación

- La posición de los bloques coincide con el layout Deye definido: PV arriba a
  la izquierda, Grid arriba a la derecha, Batería abajo a la izquierda y
  UPS + Load abajo a la derecha, con el inversor en el centro.
- Producción PV, consumo de UPS + Load, importación/exportación de Grid y
  carga/descarga de Batería producen flechas con origen y destino correctos.
- Potencias cercanas a cero no generan parpadeo de dirección.
- El SVG funciona en escritorio, móvil y resolución kiosk objetivo.
- Existen fixtures visuales para los principales escenarios energéticos.

## Delivery 3 — Historial y plots

Estado: completado.

### Alcance

- SQLite con migración/versionado de esquema.
- Construir estado inmediatamente al recibir MQTT, pero persistir un snapshot
  completo cada 5 s mediante una transacción.
- No persistir snapshots incompletos como si fueran datos válidos.
- Acumular inicialmente una ventana móvil de 24 h en SQLite. Cada nueva muestra
  debe conservarse aunque el proceso o la Raspberry Pi se reinicien, y las
  muestras con más de 24 h deben eliminarse de forma automática.
- Exponer `GET /api/history?range=...` con rangos permitidos de `1h`, `6h`,
  `12h` y `24h`, sin devolver datos anteriores a la ventana conservada.
- Integrar uPlot con potencia PV, casa, batería y red, más un plot de SOC.

### Política inicial de historial

- Conservar como máximo las últimas 24 h.
- Persistir un snapshot cada 5 s: hasta 17.280 muestras por día.
- No compactar ni agregar muestras en esta primera versión.
- Dejar la ampliación a 7 o 30 días, con compactación por resolución, para
  una entrega posterior.

### Aceptación

- Reiniciar el monitor conserva el historial.
- Los gráficos distinguen huecos reales de valores cero.
- Una consulta de 24 h es usable en Raspberry Pi 3B.
- La limpieza elimina solamente muestras anteriores a la ventana móvil de
  24 h y no borra datos recientes.

## Delivery 4 — Operación en Raspberry Pi

### Alcance

- Imagen Docker multi-arquitectura o compatible con la arquitectura objetivo.
- Compose para monitor, con opción documentada de usar un Mosquitto existente.
- Volumen persistente, healthcheck y `restart: unless-stopped`.
- Configuración completa mediante `.env` y secretos fuera del repositorio.
- Documentar instalación y modo kiosk de Chromium.
- Probar arranque sin broker, caída y regreso del broker, y base de datos dañada.

### Aceptación

- La instalación se reproduce desde un checkout limpio.
- El contenedor no necesita acceso al puerto TCP/Modbus del inversor.
- La salud diferencia proceso vivo de datos actuales.
- Reinicios no pierden configuración ni historial confirmado.

## Delivery 5 — Extras priorizados

Cada extra será una entrega independiente:

1. Potencia, tensión y balance por fase.
2. Temperaturas y energía diaria.
3. Generador.
4. Historial y detección de cortes.
5. Personalización del layout.
6. Clima y Telegram, sólo si siguen siendo necesarios.

Los comandos MQTT de escritura quedan fuera de alcance hasta diseñar autenticación,
confirmación, auditoría y límites seguros.

## Riesgos técnicos

| Riesgo | Tratamiento |
|---|---|
| Topics distintos según modelo | Adaptador configurable y Delivery 0 obligatoria |
| Signos ambiguos | Validación física en estados opuestos |
| Métricas no retained | Estado parcial al inicio y espera explícita |
| Topics de un ciclo llegan separados | Ventana de ensamblado y snapshots controlados |
| Logger no actualiza a 1 Hz | Medir duplicados y mantener 5 s si corresponde |
| Ruido cerca de cero | Zona muerta configurable |
| SQLite crece sin límite | Retención y compactación |
| CDN no disponible en kiosk | Empaquetar uPlot localmente |

## Orden recomendado de ejecución

No iniciar Delivery 1 hasta cerrar los campos esenciales de Delivery 0. Después,
ejecutar D1 → D2 → D3 → D4. Los extras no bloquean una primera instalación útil.
