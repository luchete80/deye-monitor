# Deye Monitor

Dashboard web liviano para visualizar datos publicados por
[`deye-inverter-mqtt`](../deye-inverter-mqtt/) a través de Mosquitto.

Este directorio contiene por ahora solamente la definición del proyecto. La
implementación se realizará por entregas pequeñas después de validar los topics
reales del inversor.

## Arquitectura objetivo

```text
Deye inverter
      |
      | TCP/Modbus (una sola adquisición)
      v
deye-inverter-mqtt ---> Mosquitto ---> deye-monitor ---> navegador kiosk
                                             |              |
                                             v              v
                                           SQLite        SSE + HTTP
```

`deye-monitor` no accede directamente al logger y no reemplaza ni modifica
`deye-inverter-mqtt`. Su responsabilidad empieza en MQTT.

## Decisiones iniciales

- Proyecto nuevo, no un fork ni una copia del repositorio MQTT.
- Backend Python pequeño, inicialmente Flask.
- Cliente MQTT en el backend; las credenciales no llegan al navegador.
- Estado inicial mediante `GET /api/state` y actualizaciones mediante SSE en
  `GET /events`.
- Historial formado por snapshots coherentes, no por una fila por mensaje MQTT.
- SQLite para persistencia y uPlot para series temporales.
- SVG para el diagrama y las flechas de flujo energético.
- Primera frecuencia recomendada de adquisición: 5 segundos. Una frecuencia de
  1 segundo se considera experimental hasta medir el logger real.

## Por qué no copiar `deye-inverter-mqtt`

El monitor no necesita protocolos Deye, mapas Modbus, escritura de registros,
plugins de adquisición ni manejo de flotas. Copiar el repositorio duplicaría
esas responsabilidades y dificultaría incorporar futuras actualizaciones del
proyecto original.

La reutilización correcta es por contrato: topics MQTT, unidades, disponibilidad
y configuración. Si en el futuro hiciera falta lógica común, se extraería una
pieza concreta; no se copiaría el backend entero.

## Documentación

- [Plan de entregas](docs/PLAN.md)
- [Mapa MQTT propuesto](docs/MQTT_MAPPING.md)
- [Prompts para agentes](docs/AGENT_PROMPTS.md)

## Estado

Planificación. No existe todavía una aplicación ejecutable.

