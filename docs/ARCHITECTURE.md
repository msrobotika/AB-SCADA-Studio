# Arquitectura de AB-SCADA Studio v0.1

## Componentes

- src/model.js: interpretación tipada, alarmas con ACK local, buffers acotados, exportación CSV y simulador sintético.
- src/core-feed.js: lector SSE autenticado y read-only hacia AB-Suite Core, rechazo de redirecciones y aviso explícito de cursor 409.
- src/server.js: servidor HTTP local, API de lectura, stream SSE a HMI, reconocimiento local y fallos solo en modo demo.
- src/app.js + src/app.css + index.html: pantalla de ocho estaciones, tendencias y alarmas; no accede al token del bus.
- tests: pruebas de contrato, alarmas, HTTP y red; scripts/capture.mjs captura Chromium real.

## Fuente de datos

DEMO genera valores sintéticos reproducibles cada segundo. Se pueden inyectar atascos, temperatura alta y nivel bajo solo para pruebas.

CORE lee eventos de AB-PLC Simulator a través de AB-Suite Core por loopback. El PLC virtual publica Q0.0 (transportador), I0.3 (fotocélula), C0, AI0 y estado simulado. Los otros siete equipos del sinóptico se marcan SIN SEÑAL. No se calcula OEE ni energía sin instrumentación correspondiente. La fuente sigue siendo una CPU VIRTUAL, no una planta real.

## Alarmas y límites

DEMO: JAM, temperatura de túnel ≥ 87 °C, silo ≤ 15 %. CORE: fallos reportados por el proceso virtual y pérdida de frescura de muestras tras 12 s. ACK local sin escritura industrial. Buffer de 600 muestras y 250 eventos en memoria; el servicio no incluye historiador persistente.

La aplicación rechaza Host/Origin ajenos, limita acceso a archivos estáticos y no expone el token de Core a la web. Solo escucha en 127.0.0.1. No hay OPC UA, PLC industrial ni control de seguridad funcional.
