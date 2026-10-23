#!/usr/bin/env node
import {startScada} from "../src/server.js";
const args=process.argv.slice(2);
const arg=(key,def)=>{const i=args.indexOf(key);return i<0?def:args[i+1]};
const mode=arg("--mode","demo");
const port=Number(arg("--port",4180));
const token=process.env.AB_SUITE_MONITOR_TOKEN;
const coreUrl=process.env.AB_SUITE_CORE_URL??"http://127.0.0.1:4175";
try{
  const scada=await startScada({mode,port,coreUrl,coreToken:token});
  process.stdout.write("\nMS ROBOTIKA · AB-SCADA Studio 0.1.0\n"+
    "Interfaz: "+scada.url+"\n"+
    (mode==="demo"?"MODO DEMO · todos los valores son sintéticos\n":
      "MODO SUITE CORE · datos procedentes del PLC VIRTUAL\n")+
    "Solo lectura de origen · Sin escritura a PLC, Modbus ni máquinas\n"+
    "Ctrl+C para detener.\n\n");
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await scada.close();process.exit(0)};
  process.on("SIGINT",stop);process.on("SIGTERM",stop);
}catch(error){console.error("AB-SCADA:",error.message);process.exitCode=1}
