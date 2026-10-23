/** Read-only authenticated Suite Core SSE consumer. Tokens never enter browser. */
export function validateCoreURL(raw){
  const match=/^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/.exec(raw??"");
  if(!match||+match[1]<1||+match[1]>65535)throw Error("Suite Core debe usar 127.0.0.1 y puerto válido");
  return raw;
}
const delay=(ms,signal)=>new Promise(resolve=>{
  const timer=setTimeout(done,ms);
  function done(){signal?.removeEventListener("abort",done);clearTimeout(timer);resolve()}
  signal?.addEventListener("abort",done,{once:true});
});
async function consume(body,handle,signal){
  const reader=body.getReader(),decoder=new TextDecoder();
  let buffer="";
  try{
    while(!signal.aborted){
      const {done,value}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
      if(buffer.length>131072)throw Error("Evento SSE demasiado grande");
      let end;
      while((end=buffer.indexOf("\n\n"))!==-1){
        const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const line=frame.split("\n").find(x=>x.startsWith("data: "));
        if(!line)continue;
        let event;
        try{event=JSON.parse(line.slice(6));}
        catch{throw Error("Evento JSON malformado");}
        handle(event);
      }
    }
  }finally{try{await reader.cancel();}catch{}reader.releaseLock()}
}
/** Starts live listener; first invalid/missing cursor (409) requires intervention. */
export async function followCore({model,url,token,signal,onChange=()=>{}}){
  validateCoreURL(url);
  if(!/^[a-f0-9]{64}$/.test(token??""))throw Error("Falta token monitor de Suite Core");
  let retryMs=1000;
  while(!signal.aborted){
    try{
      model.setConnection("CONECTANDO","Lectura autenticada al bus local");onChange();
      const response=await fetch(url+"/v1/events?after="+model.lastSeq,{
        headers:{Authorization:"Bearer "+token,Accept:"text/event-stream"},
        redirect:"error",signal
      });
      if(response.status===409){
        model.setConnection("BRECHA","Histórico sobrescrito: reinicia de forma explícita");
        onChange();return;
      }
      if(!response.ok)throw Error("Suite Core HTTP "+response.status);
      if(!response.body)throw Error("No hay stream SSE");
      model.setConnection("CONECTADO","Esperando snapshots del PLC virtual");onChange();
      retryMs=1000;
      await consume(response.body,event=>{
        const accepted=model.acceptCore(event);
        if(model.connection.state==="BRECHA"){
          onChange();
          throw Error("Secuencia incompleta: intervención necesaria");
        }
        if(accepted){
          model.setConnection("CONECTADO",model.latest?
            "CPU virtual y bus Suite · secuencia "+model.lastSeq:
            "Bus Suite conectado · aún sin snapshot PLC");
          onChange();
        }
      },signal);
      if(!signal.aborted)throw Error("Stream interrumpido");
    }catch(err){
      if(signal.aborted)break;
      if(model.connection.state==="BRECHA")return;
      model.setConnection("DESCONECTADO",String(err.message).slice(0,140));onChange();
      await delay(retryMs,signal);
      retryMs=Math.min(retryMs*2,10000);
    }
  }
}
