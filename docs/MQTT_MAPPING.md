# Mapeo MQTT propuesto

## Estado del documento

Este inventario proviene de los grupos de métricas incluidos en
`deye-inverter-mqtt`; no demuestra qué topics publica el inversor instalado.
Todo campo marcado **VALIDAR** debe comprobarse mediante una captura real antes
de implementar reglas de flujo o persistencia.

El topic final es:

```text
{MQTT_TOPIC_PREFIX}/{suffix}
```

Con varios loggers pasa a ser `{MQTT_TOPIC_PREFIX}/{N}/{suffix}`. El prefijo
predeterminado es `deye`.

## Perfil candidato: SG04LP3 trifásico

Requiere normalmente los grupos `deye_sg04lp3`, `deye_sg04lp3_battery` y
`deye_sg04lp3_ups`.

| Topic suffix | Unidad | Campo interno | Uso | Estado |
|---|---:|---|---|---|
| `dc/pv1/power` | W | `solar.pv1_power_w` | Tarjeta/plot | Confirmar presencia |
| `dc/pv2/power` | W | `solar.pv2_power_w` | Tarjeta/plot | Confirmar presencia |
| `dc/total_power` | W | `solar.total_power_w` | Flujo/plot | Computado por el publicador; validar |
| `day_energy` | kWh | `solar.energy_today_kwh` | Resumen | Confirmar presencia |
| `battery/power` | W | `battery.power_w_raw` | Flujo/plot | **VALIDAR signo** |
| `battery/voltage` | V | `battery.voltage_v` | Tarjeta | Confirmar contra equipo |
| `battery/current` | A | `battery.current_a_raw` | Tarjeta | **VALIDAR signo** |
| `battery/soc` | % | `battery.soc_pct` | Tarjeta/plot | Confirmar rango 0–100 |
| `battery/temperature` | °C | `battery.temperature_c` | Extra | Confirmar sensor real |
| `ac/total_power` | W | `inverter.ac_power_w` | Diagnóstico | No asumir que es red |
| `ac/total_internal_power` | W | `grid.internal_power_w_raw` | Posible red | **VALIDAR significado/signo** |
| `ac/l1/ct/external` | W | `grid.phases_raw_w[0]` | Posible red/fase | **VALIDAR CT usado** |
| `ac/l2/ct/external` | W | `grid.phases_raw_w[1]` | Posible red/fase | **VALIDAR CT usado** |
| `ac/l3/ct/external` | W | `grid.phases_raw_w[2]` | Posible red/fase | **VALIDAR CT usado** |
| `ac/daily_energy_bought` | kWh | `grid.import_today_kwh` | Resumen | Confirmar contador |
| `ac/daily_energy_sold` | kWh | `grid.export_today_kwh` | Resumen | Confirmar contador |
| `ac/l1/voltage` | V | `grid.voltage_v` | Tarjeta | Definir si se muestra L1 |
| `ac/ups/total_power` | W | `load.total_power_w` | Flujo/plot | **VALIDAR alcance de UPS** |
| `ac/ups/l1/power` | W | `load.phases_w[0]` | Fases | Confirmar presencia |
| `ac/ups/l2/power` | W | `load.phases_w[1]` | Fases | Confirmar presencia |
| `ac/ups/l3/power` | W | `load.phases_w[2]` | Fases | Confirmar presencia |
| `ac/ups/daily_energy` | kWh | `load.energy_today_kwh` | Resumen | Confirmar presencia |
| `radiator_temp` | °C | `temperature.dc_c` | Extra | Confirmar escala observada |
| `ac/temperature` | °C | `temperature.ac_c` | Extra | Confirmar escala observada |

No se elegirá definitivamente entre CT interno, CT externo u otra potencia de
red hasta comparar los topics con el display físico mientras se importa y se
exporta energía.

## Alternativa candidata: SG03LP1 monofásico

| Topic suffix | Unidad | Campo interno propuesto | Estado |
|---|---:|---|---|
| `dc/pv1/power` | W | `solar.pv1_power_w` | Confirmar |
| `dc/pv2/power` | W | `solar.pv2_power_w` | Confirmar |
| `day_energy` | kWh | `solar.energy_today_kwh` | Confirmar |
| `ac/total_grid_power` | W | `grid.power_w_raw` | **VALIDAR signo** |
| `ac/l1/voltage` | V | `grid.voltage_v` | Confirmar |
| `ac/daily_energy_bought` | kWh | `grid.import_today_kwh` | Confirmar |
| `ac/daily_energy_sold` | kWh | `grid.export_today_kwh` | Confirmar |
| `ac/total_power` | W | `inverter.ac_power_w` | No asumir que es carga |
| `radiator_temp` | °C | `temperature.dc_c` | Confirmar |
| `ac/temperature` | °C | `temperature.ac_c` | Confirmar |

Este grupo no contiene por sí solo SOC, batería ni una métrica claramente
equivalente a `ac/ups/total_power`. Se deberá confirmar el modelo y los grupos
adicionales disponibles, sin inventar carga como balance salvo que ese balance
se valide.

## Disponibilidad y frescura

| Topic suffix | Significado | Retained en el código actual |
|---|---|---|
| `status` | Servicio conectado al broker | Sí, QoS 1 |
| `logger_status` | Servicio puede conectarse al logger | No explícitamente, QoS 1 |
| métricas | Último valor leído | No explícitamente, QoS 1 |

Consecuencias:

- `status=online` no significa que el inversor esté respondiendo.
- `logger_status=online` no demuestra que todas las métricas sean recientes.
- Al arrancar, el monitor puede tener un estado parcial hasta el siguiente ciclo.
- Cada campo necesita `received_at`; el estado global necesita `oldest_required_at`
  o una regla equivalente.

El umbral stale se definirá después de medir el intervalo real. Como punto de
partida puede usarse `max(3 * read_interval, read_interval + 10 s)`.

## Modelo normalizado objetivo

```json
{
  "observed_at": null,
  "connectivity": {
    "broker": "unknown",
    "service": "unknown",
    "logger": "unknown",
    "stale": true
  },
  "solar": {
    "pv1_power_w": null,
    "pv2_power_w": null,
    "total_power_w": null
  },
  "battery": {
    "soc_pct": null,
    "voltage_v": null,
    "current_a": null,
    "power_w": null,
    "mode": "unknown"
  },
  "grid": {
    "voltage_v": null,
    "power_w": null,
    "mode": "unknown"
  },
  "load": {
    "total_power_w": null,
    "phases_w": [null, null, null]
  }
}
```

`null` significa desconocido o todavía no recibido. Nunca se lo transforma en
cero para facilitar el dibujo.

## Procedimiento de validación

1. Registrar configuración efectiva sin contraseñas.
2. Suscribirse a `{prefix}/#` antes de cambiar cargas.
3. Capturar reposo, PV activo, importación, exportación, carga y descarga.
4. Anotar simultáneamente los valores mostrados por el inversor.
5. Reconectar un cliente para probar retained.
6. Interrumpir solamente la conectividad segura del logger y observar estados.
7. Repetir con intervalos de 5 s, 2 s y opcionalmente 1 s.
8. Reemplazar cada **VALIDAR** con la evidencia y fecha de prueba.

