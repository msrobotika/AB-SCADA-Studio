/**
 * Requires CI checkout of actual AB-Suite Core in ./suitecore.
 * No mocks for the wire protocol or server.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {startSuiteCore} from "../../suitecore/src/server.js";
import {startScada} from "../../src/server.js";
const base=(server)=>"http://127.0.0.1:"+server.port;
test("SCADA lee eventos desde AB-Suite Core real sin filtrar credenciales a browser",async()=>{
 const core=await startSuiteCore({port:0});
 const scada=await startScada({mode:"core",port:0,coreUrl:core.url,
   coreToken:core.tokens.monitor,clock:false});
 try{
  const emit=(seq,jam)=>{
   core.bus.publish("ab-plc-simulator",{
    schema:"msrobotika.suite.event.v1",source:"ab-plc-simulator",
    topic:"plc.snapshot",trace_id:"scada-test-"+seq,simulated_ms:seq*100,
    data:{scan:seq,scenario:"conveyor",mode:"RUN",
      inputs:{"I0.3":seq%2===0},outputs:{"Q0.0":!jam},
      analog:{AI0:32.5},counters:{C0:seq},
      process:{kind:"conveyor",delivered:seq},faults:{jam}}
   });
  };
  emit(1,false);
  for(let i=0;i<80&&scada.model.lastSeq<1;i++)await new Promise(r=>setTimeout(r,25));
  assert.equal(scada.model.lastSeq,1);
  assert.equal(scada.model.latest.run,true);
  assert.equal(scada.model.latest.oee,null);
  emit(2,true);
  for(let i=0;i<80&&scada.model.lastSeq<2;i++)await new Promise(r=>setTimeout(r,25));
  assert.equal(scada.model.lastSeq,2);
  const state=await(await fetch(base(scada)+"/api/state")).json();
  assert.equal(state.mode,"core");
  assert.equal(state.latest.count,2);
  assert.equal(state.latest.stations.filter(x=>x.status==="unavailable").length,7);
  assert.equal(state.alarms.some(x=>x.id==="JAM"),true);
  const body=await(await fetch(base(scada)+"/")).text();
  assert.equal(body.includes(core.tokens.monitor),false);
  const client=await(await fetch(base(scada)+"/app.js")).text();
  assert.equal(client.includes(core.tokens.monitor),false);
  const denied=await fetch(base(scada)+"/api/demo/fault",{method:"POST",
    headers:{"Content-Type":"application/json","X-SCADA-Session":scada.secret},
    body:'{"type":"jam","enabled":false}'});
  assert.equal(denied.status,403);
 }finally{await scada.close();await core.close()}
});
