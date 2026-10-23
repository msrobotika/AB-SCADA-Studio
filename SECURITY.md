# Seguridad de AB-SCADA Studio

SCADA v0.1 es un visor de laboratorio, no un SCADA certificado ni un controlador de planta.

- Solo escucha en 127.0.0.1; no abrir ni redirigir el puerto a la LAN.
- Los valores DEMO son sintéticos y están indicados en la interfaz.
- Modo CORE consume eventos de una CPU virtual desde AB-Suite Core. No hay acceso a PLC ni máquinas reales.
- El token de monitor se guarda solo en el entorno de Node y nunca se envía al navegador.
- El servidor no dispone de comandos PLC, escritura Modbus ni endpoints de actuadores.
- Reconocimiento de alarmas solo local en memoria; nunca equivale al ACK de un PLC industrial.
- Al reiniciar se pierde el histórico de sesión y los reconocimientos; exporta CSV si necesitas un respaldo.
- La estimación didáctica de OEE y energía solo aparece en DEMO y nunca debe usarse para decisiones industriales.
- No se permite utilizar SCADA en funciones de seguridad, enclavamientos, parada de emergencia ni producción real.

Las vulnerabilidades deben comunicarse privadamente al mantenedor por GitHub, sin exponer credenciales.
