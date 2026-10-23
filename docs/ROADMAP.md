# Hoja de ruta

## v0.1 · Entregado en este desarrollo
- Servidor HMI local, modos DEMO/CORE separados
- Sinóptico de ocho etapas, datos no disponibles identificados
- Alarmas con reconocimiento local y bitácora
- Tendencias SVG, histórico de 600 muestras y CSV
- SSE autenticado con AB-Suite Core, sin escritura de PLC
- Pruebas Node, integración Core y capturas Chromium

## v0.2 · Calidad y extensibilidad
- Esquema de tags con unidades, calidad y versionado por estación
- Historiador persistente con backups y rotación
- Reglas de alarmas configurables y perfiles de operador
- Profundizar en la correlación por línea y lote de eventos GRAFCET/Vision (v0.1 ya recoge su estado y activa avisos básicos)
- Tendencias multivariable y filtros temporales

## v0.3+
- Constructor visual de sinópticos y componentes reutilizables
- OEE real únicamente con tiempos y cantidades medidos
- Conectores OPC UA/Modbus de solo lectura bajo autorización y pruebas
- Empaquetado, instalador y pruebas de resiliencia / rendimiento
