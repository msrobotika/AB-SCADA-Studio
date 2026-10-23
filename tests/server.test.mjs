import test from "node:test";
import assert from "node:assert/strict";
import {startScada} from "../src/server.js";
const origin=server=>"http://127.0.0.1:"+server.port;
async function api(server,route,body,secret=server.secret){
 return fetch(origin(server)+route,{method:"POST",headers:{
  "Content-Type":"application/json","X-SCADA-Session":secret},
  body:JSON.stringify(body)});
}
test("HTTP sirve la HMI, estado sintético y exportación CSV",async()=>{
 const scada=await startScada({port:0,clock:false});
 try{
  const r=await fetch(origin(scada)+"/");assert.equal(r.status,200);
  assert.match(await r.text(),/Sinóptico de producción/);
  assert.equal((await fetch(origin(scada)+"/app.css")).status,200);
  assert.equal((await fetch(origin(scada)+"/app.js")).status,200);
  const state=await(await fetch(origin(scada)+"/api/state")).json();
  assert.equal(state.mode,"demo");assert.equal(state.latest.source,"demo");
  assert.equal((await fetch(origin(scada)+"/package.json")).status,404);
  const csv=await(await fetch(origin(scada)+"/api/export.csv")).text();
  assert.match(csv,/simulatedMs,scenario/);
 }finally{await scada.close()}
});
test("rechaza control externo, origen cruzado y token inválido",async()=>{
 const s=await startScada({port:0,clock:false});
 try{
  assert.equal((await api(s,"/api/demo/fault",{type:"jam",enabled:true},"wrong")).status,403);
  const a=await fetch(origin(s)+"/api/demo/fault",{method:"POST",
    headers:{"Content-Type":"application/json","X-SCADA-Session":s.secret,
      Origin:"http://external.invalid"},body:'{"type":"jam","enabled":true}'});
  assert.equal(a.status,403);
  assert.equal(s.model.snapshot().alarms.length,0);
 }finally{await s.close()}
});
test("alarmas de demostración se reconocen pero no escriben al bus",async()=>{
 const s=await startScada({port:0,clock:false});
 try{
  assert.equal((await api(s,"/api/demo/fault",{type:"jam",enabled:true})).status,200);
  const state=await(await fetch(origin(s)+"/api/state")).json();
  assert.equal(state.alarms[0].id,"JAM");
  const ack=await api(s,"/api/alarms/ack",{code:"JAM"});
  assert.equal(ack.status,200);assert.equal((await ack.json()).ok,true);
  assert.equal(s.model.alarms.get("JAM").acked,true);
  const repeat=await api(s,"/api/alarms/ack",{code:"JAM"});
  assert.equal(repeat.status,200);
  assert.equal((await api(s,"/api/demo/fault",{type:"jam",enabled:false})).status,200);
  assert.equal(s.model.snapshot().alarms.length,0);
 }finally{await s.close()}
});
test("solo localhost y CORE requiere token válido",async()=>{
 await assert.rejects(startScada({host:"0.0.0.0",port:0}),/localhost/);
 await assert.rejects(startScada({mode:"core",port:0}),/token MONITOR/);
 await assert.rejects(startScada({mode:"core",port:0,coreToken:"a".repeat(64),coreUrl:"http://192.168.1.2:4175"}),/127.0.0.1/);
});
test("SSE de la HMI devuelve contrato de estado",async()=>{
 const s=await startScada({port:0,clock:false});
 const controller=new AbortController();
 try{
  const res=await fetch(origin(s)+"/api/stream",{signal:controller.signal});
  assert.equal(res.status,200);
  assert.match(res.headers.get("content-type"),/text\/event-stream/);
  const reader=res.body.getReader();
  const chunk=await reader.read();
  assert.match(Buffer.from(chunk.value).toString(),/msrobotika.scada.snapshot.v1/);
  await reader.cancel();
 }finally{controller.abort();await s.close()}
});
