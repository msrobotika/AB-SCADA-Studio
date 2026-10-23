import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {followCore,validateCoreURL} from "../src/core-feed.js";
import {ScadaModel} from "../src/model.js";
const sample={schema:"msrobotika.suite.event.v1",sequence:1,
 source:"ab-plc-simulator",topic:"plc.snapshot",
 received_at:"2026-10-23T14:00:00Z",simulated_ms:100,
 data:{scan:1,scenario:"conveyor",mode:"RUN",inputs:{"I0.3":false},
   outputs:{"Q0.0":true},analog:{AI0:12.3},counters:{C0:1},
   process:{kind:"conveyor",delivered:0},faults:{}}};
test("Core URL must be localhost only",()=>{
 assert.equal(validateCoreURL("http://127.0.0.1:4175"),"http://127.0.0.1:4175");
 assert.throws(()=>validateCoreURL("http://10.0.0.1:4175"),/127.0.0.1/);
 assert.throws(()=>validateCoreURL("http://127.0.0.1:99999"),/127.0.0.1/);
});
test("lectura SSE autenticada actualiza CPU y la secuencia",async()=>{
 let auth=false;
 const server=createServer((req,res)=>{
  auth=req.headers.authorization==="Bearer "+"a".repeat(64);
  res.writeHead(200,{"Content-Type":"text/event-stream"});
  res.write(": ready\n\ndata: "+JSON.stringify(sample)+"\n\n");
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const controller=new AbortController();
 const model=new ScadaModel({mode:"core"});
 try{
  const task=followCore({model,url:"http://127.0.0.1:"+server.address().port,
    token:"a".repeat(64),signal:controller.signal});
  for(let i=0;i<30&&model.lastSeq===0;i++)await new Promise(ok=>setTimeout(ok,25));
  assert.equal(auth,true);assert.equal(model.lastSeq,1);
  assert.equal(model.latest.run,true);assert.equal(model.latest.oee,null);
  controller.abort();await task;
 }finally{controller.abort();await new Promise(ok=>server.close(ok))}
});
test("HTTP 409 de histórico agotado no se ignora",async()=>{
 const server=createServer((req,res)=>{
  res.writeHead(409,{"Content-Type":"application/json"});
  res.end('{"error":"cursor expired"}');
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const controller=new AbortController(),model=new ScadaModel({mode:"core"});
 try{
  await followCore({model,url:"http://127.0.0.1:"+server.address().port,
    token:"a".repeat(64),signal:controller.signal});
  assert.equal(model.connection.state,"BRECHA");
  assert.equal(model.lastSeq,0);
 }finally{controller.abort();await new Promise(ok=>server.close(ok))}
});
