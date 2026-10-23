/** AB-SCADA Studio HMI. Never talks to PLCs or sees Suite Core tokens. */
const $=id=>document.getElementById(id);
let current=null,session=null,stream=null,toastTimer=null,requestBusy=false;
const formatter=new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fmtTime=iso=>{try{return formatter.format(new Date(iso))}catch{return "—"}};
const num=(v,d=0)=>typeof v==="number"&&Number.isFinite(v)?
  v.toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const text=(id,value)=>{const node=$(id);if(node)node.textContent=String(value)};
function showToast(message){
  const node=$("toast");node.textContent=message;node.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,3800);
}
function element(tag,klass,value){
  const e=document.createElement(tag);if(klass)e.className=klass;
  if(value!==undefined)e.textContent=String(value);return e;
}
async function send(path,body){
  if(!session||requestBusy)throw Error("Operación en curso o sesión no inicializada");
  requestBusy=true;
  try{
    const response=await fetch(path,{method:"POST",
      headers:{"Content-Type":"application/json","X-SCADA-Session":session},
      body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error??"Error al procesar la operación");
    return result;
  }finally{requestBusy=false}
}
function stateLabel(s){
  if(s.mode==="demo")return "SIMULACIÓN";
  return s.connection.state;
}
function renderAlarms(state){
  const list=$("alarm-list");list.replaceChildren();
  text("alarm-pill",state.alarms.length+" ACTIVAS");
  text("kpi-alarm",state.alarms.length);
  text("navAlarmCount",state.alarms.length);
  const unacked=state.alarms.filter(a=>!a.acked).length;
  text("alarm-note",unacked?unacked+" pendientes de reconocer":"Sin alarmas pendientes de reconocimiento");
  if(!state.alarms.length){
    const empty=element("div","alarm-empty");
    empty.append(element("div","empty-symbol","✓"),
      element("strong",null,"Sin alarmas activas"),
      element("small",null,"Todos los umbrales locales dentro de rango"));
    list.append(empty);return;
  }
  for(const alarm of state.alarms){
    const item=element("article","alarm "+(alarm.severity==="critical"?"critical":"warning"));
    const mark=element("span","alarm-mark",alarm.severity==="critical"?"!":"△");
    const content=element("div","alarm-content");
    content.append(element("strong",null,alarm.label),
      element("small",null,alarm.detail+" · "+fmtTime(alarm.raisedAt)));
    if(alarm.acked)content.append(element("small","acknowledged","✓ Reconocida por operador"));
    const button=element("button","ack-button",alarm.acked?"Reconocida":"Reconocer");
    button.type="button";button.disabled=alarm.acked;button.dataset.ack=alarm.id;
    item.append(mark,content,button);list.append(item);
  }
}
function renderStations(state){
  const latest=state.latest;
  for(const card of document.querySelectorAll(".station")){
    const stage=latest?.stations?.find(s=>s.id===card.dataset.stage);
    const status=stage?.status??"unavailable";
    card.classList.remove("running","fault","unavailable");
    if(["running","fault","unavailable"].includes(status))card.classList.add(status);
    const label=card.querySelector(".stage-status");
    if(label)label.textContent=({running:"ACTIVO",fault:"FALLO",
      unavailable:"SIN SEÑAL",observed:latest?.run?"ACTIVO":"PARADO",idle:"EN ESPERA"})[status]??"—";
    if(status==="observed" && latest?.run)card.classList.add("running");
  }
}
function renderEvents(events){
  const body=$("events-body");body.replaceChildren();
  if(!events?.length){
    const tr=element("tr");const td=element("td",null,"No hay eventos registrados");
    td.colSpan=4;tr.append(td);body.append(tr);return;
  }
  for(const event of events.slice(0,7)){
    const row=element("tr");
    for(const value of [fmtTime(event.at),
      ({alarm:"ALARMA",recovery:"RESTABLECIDO",ack:"OPERADOR",
        connection:"CONEXIÓN",system:"SISTEMA",operator:"SIMULACIÓN",grafcet:"GRAFCET",vision:"VISIÓN"})[event.kind]??event.kind,
      event.message,event.code??"AB-SCADA"]){
      row.append(element("td",null,value));
    }
    body.append(row);
  }
}
function renderChart(state){
  const field=$("trend-select").value;
  const unit=({temperature:"°C",weight:"%",count:"unid.",ai0:"AI0"})[field];
  text("trend-unit",unit??"");
  const points=(state.history??[]).filter(p=>
    typeof p[field]==="number" && Number.isFinite(p[field])).slice(-90);
  text("trend-current",points.length?num(points.at(-1)[field],field==="count"?0:1):"—");
  $("chart-empty").hidden=points.length!==0;
  const line=$("line-path"),area=$("area-path"),grid=$("chart-grid");
  if(points.length===0){
    line.setAttribute("d","");area.setAttribute("d","");grid.replaceChildren();return;
  }
  const vals=points.map(p=>p[field]);
  const localMin=Math.min(...vals),localMax=Math.max(...vals);
  const padding=Math.max((localMax-localMin)*.23,field==="count"?2:1);
  const min=localMin-padding,max=localMax+padding;
  const left=43,right=691,top=17,bottom=181;
  const x=i=>left+i/(Math.max(1,vals.length-1))*(right-left);
  const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const d=vals.map((v,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(v).toFixed(1)).join(" ");
  line.setAttribute("d",d);
  area.setAttribute("d",d+" L"+x(vals.length-1).toFixed(1)+","+bottom+" L"+left+","+bottom+" Z");
  const parts=[];
  for(let i=0;i<4;i++){
    const yy=top+i/3*(bottom-top),v=max-i/3*(max-min);
    const rule=document.createElementNS("http://www.w3.org/2000/svg","line");
    rule.setAttribute("x1",left);rule.setAttribute("x2",right);
    rule.setAttribute("y1",yy);rule.setAttribute("y2",yy);
    rule.setAttribute("class","chart-grid-line");parts.push(rule);
    const label=document.createElementNS("http://www.w3.org/2000/svg","text");
    label.setAttribute("x","3");label.setAttribute("y",yy+4);
    label.setAttribute("class","chart-axis-label");
    label.textContent=num(v,field==="count"?0:1);parts.push(label);
  }
  grid.replaceChildren(...parts);
}
function render(state){
  current=state;
  const s=state.latest,mode=state.mode;
  const core=mode==="core";
  text("source-title",core?"SUITE CORE · PLC VIRTUAL":"MODO DEMOSTRACIÓN");
  text("source-note",core?
    "Lecturas autenticadas de AB-PLC Simulator · otros equipos sin señal propia":
    "Datos sintéticos de laboratorio · No hay PLC ni maquinaria conectada");
  text("source-chip",core?"VIRTUAL PLC / SSE":"SYNTHETIC DATA");
  $("source-banner").classList.toggle("live",core && state.connection.state==="CONECTADO");
  text("side-mode",core?"AB-Suite Core":"Laboratorio local");
  text("side-conn",core?state.connection.state:"Datos de demostración");
  $("side-dot").className="dot "+(core?
    (state.connection.state==="CONECTADO"?"ok":state.connection.state==="BRECHA"?"error":"warning"):"ok");
  text("clock",formatter.format(new Date()));
  text("kpi-count",num(s?.count));
  text("kpi-oee",num(s?.oee,1));
  text("kpi-energy",num(s?.energy,1));
  text("count-note",core?"Contador C0 del PLC virtual":"Piezas sintéticas acumuladas");
  text("oee-note",core?"No disponible en Suite Core":"Indicador ilustrativo · no OEE auditado");
  text("energy-note",core?"No hay contador energético":"Estimación sintética / laboratorio");
  text("cpu-status",core?"CPU · "+(s?.mode??"SIN DATOS"):"CPU · DEMO");
  text("run-state",core?(s?.run?"TRANSPORTADOR ACTIVO":"SALIDA INACTIVA"):
    s?.run?"PROCESO ACTIVO":"PROCESO DETENIDO");
  text("scan-value","Scan "+(s?.scan??"—"));
  text("process-note",core?"Solo CV-08 tiene correspondencia digital Q0.0 · resto sin telemetría":
    "Ciclo de producción sintético; elementos ilustrativos");
  text("diag-link",stateLabel(state));
  text("diag-source",core?"SUITE CORE (VIRTUAL)":"DEMOSTRACIÓN");
  text("diag-seq",core?state.sequence:"—");
  text("diag-ai",num(s?.ai0,1));
  text("diag-pe",s?(s.photoeye?"ACTIVA":"INACTIVA"):"—");
  text("diag-grafcet",state.external?.grafcet?(state.external.grafcet.stepId+(state.external.grafcet.active?" · ON":" · OFF")):"—");
  text("diag-vision",state.external?.inspections?state.external.inspections+" · "+state.external.notPassed+" no conformes":"—");
  $("demo-tools").hidden=core;
  if(!core){
    for(const [fault,value] of [["jam",Boolean(s?.faults?.jam)],
      ["heat",typeof s?.temperature==="number"&&s.temperature>=87],
      ["low",typeof s?.weight==="number"&&s.weight<=15]]){
      const button=document.querySelector('[data-fault="'+fault+'"]');
      if(button)button.setAttribute("aria-pressed",String(value));
    }
  }
  renderStations(state);renderAlarms(state);renderEvents(state.events);renderChart(state);
}
async function loadState(){
  const response=await fetch("/api/state",{cache:"no-store"});
  if(!response.ok)throw Error("No se pudo leer el servidor SCADA");
  render(await response.json());
}
function attachHandlers(){
  $("trend-select").addEventListener("change",()=>{if(current)renderChart(current)});
  $("alarm-list").addEventListener("click",async event=>{
    const target=event.target.closest("[data-ack]");if(!target)return;
    target.disabled=true;
    try{await send("/api/alarms/ack",{code:target.dataset.ack});showToast("Alarma reconocida; no se modificó ningún PLC");await loadState()}
    catch(err){showToast(err.message);target.disabled=false}
  });
  $("demo-tools").addEventListener("click",async event=>{
    const button=event.target.closest("[data-fault]");if(!button)return;
    try{
      const enabled=button.getAttribute("aria-pressed")!=="true";
      await send("/api/demo/fault",{type:button.dataset.fault,enabled});
      await loadState();
      showToast(enabled?"Fallo sintético activado":"Fallo sintético retirado");
    }catch(err){showToast(err.message)}
  });
  document.querySelectorAll(".side-nav a").forEach(link=>{
    link.addEventListener("click",()=>{
      document.querySelectorAll(".side-nav a").forEach(a=>a.classList.remove("active"));
      link.classList.add("active");
    });
  });
}
async function init(){
  attachHandlers();
  try{
    const response=await fetch("/api/session");
    if(!response.ok)throw Error("Sesión no disponible");
    const value=await response.json();session=value.session;
    if(value.mode==="core")$("trend-select").value="count";
    await loadState();
    stream=new EventSource("/api/stream");
    stream.addEventListener("state",event=>{
      try{render(JSON.parse(event.data))}
      catch(error){console.error("Estado SCADA inválido",error)}
    });
    stream.onerror=()=>{text("diag-link","RECONECTANDO · UI");};
    setInterval(()=>{if(stream?.readyState!==EventSource.OPEN)loadState().catch(()=>{})},6000);
  }catch(err){
    showToast("No fue posible conectar con AB-SCADA: "+err.message);
    text("source-title","SCADA SIN SERVICIO");
  }
}
init();
