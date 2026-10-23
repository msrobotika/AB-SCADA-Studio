/** Genuine Playwright Chromium functional checks and screenshots; no mock HTML. */
import {chromium} from "playwright";
import {createServer} from "node:http";
import {mkdir} from "node:fs/promises";
import {startScada} from "../src/server.js";

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
let scada=null,core=null;
try{
 await mkdir("docs/screenshots",{recursive:true});
 const page=await browser.newPage({viewport:{width:1600,height:1040},deviceScaleFactor:1});
 const errors=[];page.on("pageerror",err=>errors.push(err.message));
 scada=await startScada({port:0,mode:"demo"});
 await page.goto(scada.url,{waitUntil:"domcontentloaded"});
 await page.locator("#source-title").filter({hasText:"MODO DEMOSTRACIÓN"}).waitFor();
 await page.locator(".station.running").first().waitFor();
 await page.waitForTimeout(700);
 const count=await page.locator("#kpi-count").innerText();
 if(count==="—")throw Error("Falta producción en demo");
 await page.screenshot({path:"docs/screenshots/scada-overview.png",fullPage:true,animations:"disabled"});
 await page.locator("#demo-jam").click();
 await page.locator('[data-ack="JAM"]').waitFor();
 if(!await page.locator("#alarm-list").getByText("Atasco de transportador").isVisible())
   throw Error("No se visualiza alarma de atasco");
 await page.locator('[data-ack="JAM"]').click();
 await page.getByText("Reconocida por operador",{exact:false}).first().waitFor();
 await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
 await page.waitForTimeout(250);
 if(await page.evaluate(()=>window.scrollY)!==0)
   throw Error("Captura desplazada: sidebar fuera de encuadre");
 await page.screenshot({path:"docs/screenshots/scada-alarms.png",fullPage:true,animations:"disabled"});
 await scada.close();scada=null;
 if(errors.length)throw Error("Fallos JavaScript HMI: "+errors.join("; "));
 // A small fake *Core source* is used ONLY for visual regression; the actual
 // Suite Core integration is verified separately by tests/integration/core.test.mjs.
 core=createServer((req,res)=>{
   if(req.url.startsWith("/v1/events")){
     if(req.headers.authorization!=="Bearer "+"b".repeat(64)){
       res.writeHead(401);res.end();return;
     }
     res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache"});
     res.write(": ready\n\n");
     const value={schema:"msrobotika.suite.event.v1",source:"ab-plc-simulator",
       topic:"plc.snapshot",sequence:1,received_at:new Date().toISOString(),
       simulated_ms:5000,data:{scan:50,scenario:"conveyor",mode:"RUN",
         inputs:{"I0.3":false},outputs:{"Q0.0":true},
         analog:{AI0:15.5},counters:{C0:12},
         process:{kind:"conveyor",delivered:11},faults:{}}};
     res.write("data: "+JSON.stringify(value)+"\n\n");
   }else{res.writeHead(404);res.end()}
 });
 await new Promise(ok=>core.listen(0,"127.0.0.1",ok));
 scada=await startScada({port:0,mode:"core",coreUrl:"http://127.0.0.1:"+core.address().port,
   coreToken:"b".repeat(64)});
 await page.goto(scada.url,{waitUntil:"domcontentloaded"});
 await page.locator("#source-title").filter({hasText:"SUITE CORE"}).waitFor();
 await page.locator("#kpi-count").filter({hasText:"12"}).waitFor({timeout:6000});
 const oee=await page.locator("#kpi-oee").innerText();
 if(oee!=="—")throw Error("OEE inventado en modo Core");
 await page.locator('[data-stage="silos"].unavailable').waitFor();
 await page.locator("#demo-tools").evaluate(el=>{if(!el.hidden)throw Error("Control demo visible en Core")});
 await page.waitForTimeout(550);
 await page.screenshot({path:"docs/screenshots/scada-suite-core.png",fullPage:true,animations:"disabled"});
 if(errors.length)throw Error("Fallos JavaScript HMI: "+errors.join("; "));
 process.stdout.write("Chromium: 3 capturas reales y verificaciones HMI completas.\n");
}finally{
 if(scada)await scada.close();
 if(core)await new Promise(ok=>core.close(ok));
 await browser.close();
}
