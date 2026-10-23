import test from "node:test";
import assert from "node:assert/strict";
import {ScadaModel,parseCoreEvent,LINE} from "../src/model.js";
const sample=(sequence=1,override={})=>({
  schema:"msrobotika.suite.event.v1",source:"ab-plc-simulator",topic:"plc.snapshot",
  sequence,received_at:"2026-10-23T15:00:00Z",simulated_ms:sequence*100,
  data:{scan:sequence,scenario:"conveyor",mode:"RUN",inputs:{"I0.3":true},
    outputs:{"Q0.0":true},analog:{AI0:27.4},counters:{C0:12},
    process:{kind:"conveyor",delivered:7},faults:{jam:false},...override}
});
test("sinóptico tiene ocho estaciones y datos reales solo en salida",()=>{
 const p=parseCoreEvent(sample());
 assert.equal(LINE.length,8);assert.equal(p.stations.filter(x=>x.status==="observed").length,1);
 assert.equal(p.count,12);assert.equal(p.oee,null);assert.equal(p.energy,null);
 assert.equal(p.run,true);assert.equal(p.temperature,null);
});
test("no inventa señales de proceso ni KPI sin telemetría",()=>{
 const p=parseCoreEvent(sample(1,{analog:{AI0:33},process:{kind:"rack"}}));
 assert.equal(p.weight,null);assert.equal(p.level,null);assert.equal(p.energy,null);
 assert.equal(p.stations[0].status,"unavailable");
});
test("rechaza snapshots incompatibles y valores peligrosos",()=>{
 assert.throws(()=>parseCoreEvent(sample(1,{analog:{AI0:Infinity}})),/finito/);
 assert.throws(()=>parseCoreEvent(sample(1,{mode:"BROKEN"})),/incompatible/);
 assert.throws(()=>parseCoreEvent(sample(1,{counters:{C0:-2}})),/C0/);
 assert.equal(parseCoreEvent({...sample(),topic:"grafcet.stage.changed"}),null);
});
test("demo reproducible y marcada como sintética",()=>{
 let now=Date.parse("2026-10-23T10:00:00Z");
 const a=new ScadaModel({now:()=>now}),b=new ScadaModel({now:()=>now});
 assert.equal(a.mode,"demo");
 assert.equal(a.latest.quality,b.latest.quality);
 assert.equal(a.latest.temperature,b.latest.temperature);
 assert.match(a.snapshot().sourceLabel,/SINTÉTICOS/);
 assert.equal(a.history.length,32);
});
test("fallo demo activa alarma, permite reconocer y desactivar",()=>{
 const m=new ScadaModel();
 m.demoFault("jam",true);
 const a=m.snapshot().alarms.find(a=>a.id==="JAM");
 assert.equal(a.active,true);assert.equal(a.acked,false);
 m.ack("JAM");
 assert.equal(m.snapshot().alarms.find(a=>a.id==="JAM").acked,true);
 m.demoFault("jam",false);
 assert.equal(m.snapshot().alarms.some(a=>a.id==="JAM"),false);
 assert.match(m.events[0].message,/Restablecido/);
});
test("alarmas vuelven a no reconocidas si se reactivan",()=>{
 const m=new ScadaModel();
 m.demoFault("heat",true);
 m.ack("DRY_HIGH");
 m.demoFault("heat",false);
 m.demoFault("heat",true);
 assert.equal(m.snapshot().alarms.find(a=>a.id==="DRY_HIGH").acked,false);
});
test("prohíbe inyección de fallo en modo Core",()=>{
 const m=new ScadaModel({mode:"core"});
 assert.throws(()=>m.demoFault("jam",true),/Solo/);
 assert.throws(()=>m.ack("missing"),/no activa/);
});
test("filtro duplicados, memoria acotada y exportación CSV",()=>{
 const m=new ScadaModel({mode:"core",capacity:10});
 assert.equal(m.acceptCore(sample(1)),true);
 assert.equal(m.acceptCore(sample(1)),false);
 for(let i=2;i<18;i++)m.acceptCore(sample(i));
 assert.equal(m.history.length,10);
 const csv=m.exportCSV();
 assert.match(csv,/simulatedMs,scenario/);
 assert.equal(csv.trim().split(/\r?\n/).length,11);
});
test("telemetría obsoleta genera alarma reconocible",()=>{
 let current=Date.parse("2026-10-23T10:00:00Z");
 const m=new ScadaModel({mode:"core",now:()=>current});
 m.acceptCore(sample());
 current+=12500;
 assert.equal(m.snapshot().stale,true);
 assert.equal(m.snapshot().alarms.some(a=>a.id==="STALE"),true);
 m.ack("STALE");assert.equal(m.snapshot().alarms.find(a=>a.id==="STALE").acked,true);
 m.acceptCore(sample(2));assert.equal(m.snapshot().stale,false);
});
test("lecturas del bus pueden señalar atasco real del PLC virtual",()=>{
 const m=new ScadaModel({mode:"core"});
 m.acceptCore(sample(1,{faults:{jam:true}}));
 assert.equal(m.snapshot().alarms.find(a=>a.id==="JAM").severity,"critical");
 m.acceptCore(sample(2,{faults:{jam:false}}));
 assert.equal(m.snapshot().alarms.some(a=>a.id==="JAM"),false);
});
