# Inventario de Línea 1 (demostración)

Cadena de referencia: silos, báscula dosificadora, rechazo, mezclador, laminador, bañera antiadherente, túnel de secado, transportador/salida.

| Estación | Tag ilustrativo | DEMO | CORE (PLC virtual) |
| --- | --- | --- | --- |
| Silos | SL-01 | Sí | Sin señal |
| Báscula | BW-02 | Sí | Sin señal |
| Rechazo | RJ-03 | Sí | Sin señal |
| Mezclador | MX-04 | Sí | Sin señal |
| Laminador | LM-05 | Sí | Sin señal |
| Bañera | BT-06 | Sí | Sin señal |
| Túnel | DR-07 | Sí | Sin señal |
| Transportador | CV-08 | Sí | Q0.0, I0.3, C0, AI0 |

No se conocen las direcciones PLC físicas ni la instrumentación real de la planta de Arnedo. El SCADA no está conectado a la planta. Para una implantación piloto real: inventario CPU y red, contrato de tags, unidades, permisos de solo lectura, calibraciones y pruebas de interoperabilidad. Las señales de seguridad son ajenas a esta herramienta.
