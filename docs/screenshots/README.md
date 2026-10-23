# Capturas Chromium auténticas

Generadas mediante npm run screenshots, abriendo la HMI real en Chromium con Playwright. Nunca sustituyen una prueba de seguridad industrial.

- scada-overview.png: DEMO, línea de 8 estaciones, tendencias y KPI sintéticos.
- scada-alarms.png: atasco inyectado, alarma y reconocimiento local.
- scada-suite-core.png: visor CORE recibiendo un productor SSE local de prueba. KPI no disponibles en CORE aparecen como —; siete estaciones no instrumentadas están SIN SEÑAL.

El test adicional de integración usa el repositorio auténtico de AB-Suite Core en tests/integration/core.test.mjs.

No se capturan contraseñas, rutas privadas ni credenciales de planta.
