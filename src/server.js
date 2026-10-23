/** AB-SCADA Studio HTTP/SSE. Local read-only supervision, not PLC control. */
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {ScadaModel} from "./model.js";
import {followCore,validateCoreURL} from "./core-feed.js";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const STATIC=new Map([["/","index.html"],["/index.html","index.html"],
  ["/app.js","src/app.js"],["/app.css","src/app.css"]]);
const TYPE={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8"};
const ex=(message,status=400)=>Object.assign(new Error(message),{status});
const validPort=x=>Number.isInteger(x)&&x>=0&&x<=65535;
function respond(res,status,data,headers={}){
  const payload=Buffer.from(typeof data==="string"?data:JSON.stringify(data));
  res.writeHead(status,{"Content-Length":payload.length,
    "Content-Type":typeof data==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...headers});
  res.end(payload);
}
function equal(a,b){
  const x=Buffer.from(a??""),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
async function bodyJSON(req){
  const parts=[];let length=0;
  for await(const part of req){
    length+=part.length;
    if(length>5000)throw ex("Solicitud demasiado extensa",413);
    parts.push(part);
  }
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}
  catch{throw ex("JSON inválido")}
}
export async function startScada({
  port=4180,host="127.0.0.1",mode="demo",
  coreUrl="http://127.0.0.1:4175",coreToken=null,clock=true,
  model=new ScadaModel({mode})
}={}){
  if(host!=="127.0.0.1")throw ex("AB-SCADA solo puede abrir localhost");
  if(!validPort(port))throw ex("Puerto HTTP inválido");
  if(!["demo","core"].includes(mode)||model.mode!==mode)throw ex("Modo SCADA inválido");
  if(mode==="core"){
    validateCoreURL(coreUrl);
    if(!/^[a-f0-9]{64}$/.test(coreToken??""))throw ex("Se necesita el token MONITOR de Suite Core");
  }
  const secret=randomBytes(24).toString("hex"),clients=new Set(),sockets=new Set();
  let server,timer;
  const controller=new AbortController();
  function broadcast(){
    const data="event: state\ndata: "+JSON.stringify(model.snapshot())+"\n\n";
    for(const res of [...clients]){
      if(res.destroyed||!res.write(data)){clients.delete(res);res.destroy()}
    }
  }
  async function handler(req,res){
    try{
      const authority="127.0.0.1:"+server.address().port;
      if(req.headers.host!==authority ||
        (req.headers.origin&&req.headers.origin!=="http://"+authority) ||
        req.headers["sec-fetch-site"]==="cross-site")throw ex("Origen no autorizado",403);
      const url=new URL(req.url,"http://"+authority);
      if(url.pathname==="/api/state" && req.method==="GET")
        return respond(res,200,model.snapshot());
      if(url.pathname==="/api/stream" && req.method==="GET"){
        if(clients.size>=12)throw ex("Límite de clientes alcanzado",503);
        res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8",
          "Cache-Control":"no-cache, no-transform","Connection":"keep-alive",
          "X-Accel-Buffering":"no","X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"});
        clients.add(res);
        res.write("retry: 1500\n\nevent: state\ndata: "+JSON.stringify(model.snapshot())+"\n\n");
        const beat=setInterval(()=>{if(!res.destroyed)res.write(": heartbeat\n\n")},13000);
        res.on("close",()=>{clearInterval(beat);clients.delete(res)});
        return;
      }
      if(url.pathname==="/api/export.csv" && req.method==="GET"){
        return respond(res,200,model.exportCSV(),{
          "Content-Type":"text/csv; charset=utf-8",
          "Content-Disposition":'attachment; filename="AB-SCADA-telemetry.csv"'});
      }
      if(url.pathname==="/api/alarms/ack" && req.method==="POST"){
        if(!equal(req.headers["x-scada-session"],secret))throw ex("Sesión operativa inválida",403);
        const data=await bodyJSON(req);
        if(!data||typeof data.code!=="string"||data.code.length>60)throw ex("Código de alarma inválido");
        model.ack(data.code);broadcast();
        return respond(res,200,{ok:true,code:data.code});
      }
      if(url.pathname==="/api/demo/fault" && req.method==="POST"){
        if(mode!=="demo")throw ex("Prohibido en modo Core",403);
        if(!equal(req.headers["x-scada-session"],secret))throw ex("Sesión inválida",403);
        const data=await bodyJSON(req);
        model.demoFault(data?.type,data?.enabled);
        broadcast();return respond(res,200,{ok:true});
      }
      if(url.pathname==="/api/session" && req.method==="GET"){
        return respond(res,200,{session:secret,mode,role:"operador local / reconocimiento",
          authority:"Nunca escribe en PLC ni maquinaria"});
      }
      if(req.method!=="GET"&&req.method!=="HEAD")throw ex("Método prohibido",405);
      const target=STATIC.get(url.pathname);
      if(!target)throw ex("Recurso inexistente",404);
      const data=await readFile(resolve(ROOT,target));
      const ext=target.substring(target.lastIndexOf("."));
      res.writeHead(200,{"Content-Type":TYPE[ext]??"application/octet-stream",
        "Content-Length":data.length,"Cache-Control":"no-store",
        "Content-Security-Policy":"default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
      res.end(req.method==="HEAD"?undefined:data);
    }catch(err){
      if(!res.headersSent)respond(res,err.status??(err.code==="ENOENT"?404:400),
        {error:err.message??"Error de servidor"});
      else res.destroy();
    }
  }
  server=createServer(handler);
  server.on("connection",socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket))});
  await new Promise((ok,bad)=>{
    server.once("error",bad);server.listen(port,host,ok);
  });
  if(clock){
    if(mode==="demo")timer=setInterval(()=>{model.demoStep();broadcast()},1000);
    else timer=setInterval(()=>{model.freshness();broadcast()},1500);
  }
  const liveTask=mode==="core"?followCore({model,url:coreUrl,token:coreToken,
    signal:controller.signal,onChange:broadcast}).catch(e=>{
    model.setConnection("ERROR",e.message);broadcast()}):null;
  const close=async()=>{
    controller.abort();if(timer)clearInterval(timer);
    for(const c of clients)c.destroy();
    for(const s of sockets)s.destroy();
    await new Promise(ok=>server.close(ok));
    if(liveTask)await Promise.race([liveTask,new Promise(ok=>setTimeout(ok,700))]);
  };
  return {url:"http://127.0.0.1:"+server.address().port,
    port:server.address().port,mode,model,close,broadcast,secret};
}
