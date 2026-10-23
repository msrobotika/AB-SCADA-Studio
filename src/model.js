/** AB-SCADA Studio: bounded, read-only telemetry, alarm and audit model. MIT. */
export const LINE = Object.freeze([
  {id:"silos",name:"Silos",sub:"Materias primas",tag:"SL-01"},
  {id:"weigh",name:"Báscula",sub:"Dosificación",tag:"BW-02"},
  {id:"reject",name:"Rechazo",sub:"Desvío",tag:"RJ-03"},
  {id:"mixer",name:"Mezclador",sub:"Homogeneización",tag:"MX-04"},
  {id:"roller",name:"Laminador",sub:"Formación",tag:"LM-05"},
  {id:"bath",name:"Bañera",sub:"Antiadherente",tag:"BT-06"},
  {id:"tunnel",name:"Túnel",sub:"Secado",tag:"DR-07"},
  {id:"pack",name:"Salida",sub:"Transportador",tag:"CV-08"}
]);
const truthy=x=>x===true;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const round=(n,d=1)=>Number(n.toFixed(d));
function fail(message){throw new Error(message)}
const copy=value=>structuredClone(value);
export function parseCoreEvent(event){
  if(!event||event.schema!=="msrobotika.suite.event.v1" ||
    event.source!=="ab-plc-simulator" || event.topic!=="plc.snapshot")
    return null;
  const d=event.data;
  if(!d || !Number.isSafeInteger(event.sequence)||event.sequence<1 ||
     !Number.isSafeInteger(d.scan) || d.scan<0 ||
     !["RUN","PAUSE","STOP"].includes(d.mode) ||
     !["conveyor","tank","rack"].includes(d.scenario) ||
     !d.inputs||typeof d.inputs!=="object" ||
     !d.outputs||typeof d.outputs!=="object" ||
     !d.analog||typeof d.analog!=="object")fail("Snapshot PLC incompatible");
  const ai0=d.analog.AI0??0;
  if(!finite(ai0))fail("AI0 no es finito");
  const count=d.counters?.C0??0;
  if(!Number.isSafeInteger(count)||count<0)fail("C0 inválido");
  const delivered=d.process?.delivered??0;
  if(!finite(delivered)||delivered<0)fail("Producción de simulador inválida");
  const simMs=event.simulated_ms;
  if(simMs!==undefined&&(!Number.isSafeInteger(simMs)||simMs<0))fail("Reloj simulado inválido");
  return {
    source:"suite",sequence:event.sequence,ts:event.received_at??new Date().toISOString(),
    simulatedMs:simMs??null,scenario:d.scenario,scan:d.scan,mode:d.mode,
    count,delivered,level:finite(d.process?.level)?d.process.level:null,
    ai0,run:truthy(d.outputs["Q0.0"]),
    photoeye:truthy(d.inputs["I0.3"]),
    faults:Object.fromEntries(Object.entries(d.faults??{}).filter(([k,v])=>
      typeof k==="string"&&k.length<=80&&typeof v==="boolean")),
    quality: "Datos de simulación PLC · AB-Suite Core",
    stations:LINE.map(x=>({id:x.id,status:x.id==="pack"?"observed":"unavailable"})),
    energy:null,oee:null,temperature:null,weight:null,speed:null
  };
}
export class ScadaModel{
  constructor({mode="demo",now=()=>Date.now(),capacity=600}={}){
    if(!["demo","core"].includes(mode))fail("Modo desconocido");
    this.mode=mode;this.now=now;this.capacity=capacity;
    this.latest=null;this.history=[];this.events=[];this.alarms=new Map();
    this.stateVersion=0;this.lastSeq=0;this.receivedAt=0;
    this.connection={state:mode==="demo"?"SIMULACIÓN":"ESPERANDO",detail:""};
    this.demo={t:0,jam:false,heat:false,low:false,enabled:true};
    if(mode==="demo")for(let i=0;i<32;i++)this.demoStep();
  }
  event(kind,message,extra={}){
    const item={id:++this.stateVersion,at:new Date(this.now()).toISOString(),
      kind,message,...extra};
    this.events.unshift(item);
    if(this.events.length>250)this.events.length=250;
    return item;
  }
  alarm(code,active,{severity="warning",label="",detail=""}={}){
    const old=this.alarms.get(code);
    if(active && !old?.active){
      const value={id:code,severity,label,detail,active:true,acked:false,
        raisedAt:new Date(this.now()).toISOString(),clearedAt:null};
      this.alarms.set(code,value);
      this.event("alarm","ALARMA · "+label,{code});
    }else if(!active && old?.active){
      old.active=false;old.clearedAt=new Date(this.now()).toISOString();
      this.event("recovery","Restablecido · "+old.label,{code});
    }
  }
  ack(code){
    const alarm=this.alarms.get(code);
    if(!alarm||!alarm.active)fail("Alarma no activa");
    if(alarm.acked)return this.snapshot();
    alarm.acked=true;
    alarm.ackedAt=new Date(this.now()).toISOString();
    this.event("ack","Reconocimiento operador · "+alarm.label,{code});
    return this.snapshot();
  }
  apply(sample){
    if(sample.sequence!==null && sample.sequence!==undefined){
      if(sample.sequence<=this.lastSeq)return false;
      this.lastSeq=sample.sequence;
    }
    this.latest=copy(sample);
    this.receivedAt=this.now();
    const point={
      time:sample.ts,simulatedMs:sample.simulatedMs,scenario:sample.scenario,
      scan:sample.scan,run:sample.run,count:sample.count,delivered:sample.delivered,
      level:sample.level,ai0:sample.ai0,energy:sample.energy,
      temperature:sample.temperature,weight:sample.weight,oee:sample.oee
    };
    this.history.push(point);
    if(this.history.length>this.capacity)this.history.shift();
    this.evaluate();
    return true;
  }
  acceptCore(event){
    const value=parseCoreEvent(event);
    if(!value)return false;
    if(event.sequence>this.lastSeq+1 && this.lastSeq>0){
      this.connection={state:"BRECHA",detail:"Faltan eventos del bus: "+this.lastSeq+"→"+event.sequence};
      this.event("system","Brecha de secuencias detectada; no asumir continuidad");
    }
    return this.apply(value);
  }
  evaluate(){
    const s=this.latest;if(!s)return;
    const demo=s.source==="demo";
    this.alarm("JAM",s.faults.jam===true,{severity:"critical",
      label:"Atasco de transportador",detail:"Detenido por fallo virtual"});
    this.alarm("DRY_HIGH",demo&&s.temperature>=87,{severity:"critical",
      label:"Temperatura del túnel elevada",detail:"Umbral didáctico 87 °C"});
    this.alarm("SILO_LOW",demo&&s.weight<=15,{severity:"warning",
      label:"Nivel bajo de silo",detail:"Umbral didáctico 15 %"});
    this.alarm("SENSOR_STUCK",s.faults.sensorStuck===true,{severity:"warning",
      label:"Fotocélula simulada bloqueada",detail:"Sensor virtual en ON"});
    this.alarm("LEVEL_SENSOR",s.faults.levelSensorStuck===true,{severity:"warning",
      label:"Nivel alto simulado bloqueado",detail:"Revisar la simulación"});
    this.alarm("LEAK",s.faults.leak===true,{severity:"critical",
      label:"Fuga virtual",detail:"Modelo de depósito"});
  }
  setConnection(state,detail=""){
    if(this.connection.state!==state || this.connection.detail!==detail){
      this.connection={state,detail};this.event("connection",state+" · "+detail);
    }
  }
  freshness(){
    const stale=this.mode==="core"&&this.receivedAt>0&&this.now()-this.receivedAt>12000;
    this.alarm("STALE",stale,{severity:"critical",label:"Telemetría sin actualizar",
      detail:"Último snapshot hace más de 12 segundos"});
    return stale;
  }
  demoFault(type,enabled){
    if(this.mode!=="demo")fail("Solo permitido en demostración");
    if(!["jam","heat","low"].includes(type)||typeof enabled!=="boolean")fail("Fallo inválido");
    this.demo[type]=enabled;
    this.event("operator",enabled?"Fallo demo activado: "+type:"Fallo demo retirado: "+type);
    this.demoStep();
  }
  demoStep(){
    if(this.mode!=="demo")fail("Sin motor de demostración en modo Core");
    const d=this.demo;d.t++;
    const t=d.t;
    const run=!d.jam&&d.enabled;
    const temperature=round(d.heat?91+2*Math.sin(t/3):68+4*Math.sin(t/7));
    const weight=round(d.low?9+Math.sin(t/4):58+22*Math.sin(t/28));
    const count=Math.max(0,Math.floor(t/3)-(d.jam?3:0));
    const stations=LINE.map((s,i)=>({id:s.id,status:
      (d.jam&&i>=5)?"fault":run?"running":"idle"}));
    const sample={
      source:"demo",sequence:null,ts:new Date(this.now()).toISOString(),
      simulatedMs:t*1000,scenario:"linea-1",scan:t,mode:run?"RUN":"PAUSE",
      count,delivered:count,level:null,ai0:round(12+Math.sin(t/5)*1.5),
      run,photoeye:t%5===0,
      temperature,weight,speed:run?round(19+Math.sin(t/6)*2):0,
      energy:round((t*.018)+t*.0003),oee:run?round(79+7*Math.sin(t/15)):null,
      faults:{jam:d.jam},stations,
      quality:"DEMOSTRACIÓN · valores sintéticos / no conectados"
    };
    this.apply(sample);
    return sample;
  }
  snapshot(){
    const stale=this.freshness();
    const active=[...this.alarms.values()].filter(a=>a.active)
      .sort((a,b)=>(a.severity==="critical"?0:1)-(b.severity==="critical"?0:1));
    return {
      contract:"msrobotika.scada.snapshot.v1",mode:this.mode,connection:this.connection,
      stale,sourceLabel:this.mode==="demo"?"LABORATORIO · DATOS SINTÉTICOS":"SUITE CORE · PLC VIRTUAL",
      latest:this.latest,alarms:active,alarmHistory:[...this.alarms.values()],
      events:this.events.slice(0,100),history:this.history.slice(-160),
      eventCount:this.events.length,sequence:this.lastSeq,updatedAt:this.receivedAt?
        new Date(this.receivedAt).toISOString():null,line:LINE
    };
  }
  exportCSV(){
    const keys=["time","simulatedMs","scenario","scan","run","count",
      "delivered","level","ai0","temperature","weight","energy","oee"];
    const escape=v=>v==null?"":('"'+String(v).replaceAll('"','""')+'"');
    return [keys.join(","),...this.history.map(p=>keys.map(k=>escape(p[k])).join(","))].join("\r\n")+"\r\n";
  }
}
