function solarHistoryData(rows){
  const x=[],y=[],times=rows.map(row=>new Date(row.captured_at).getTime()/1000);
  const intervals=times.slice(1).map((time,index)=>time-times[index]).filter(value=>value>0).sort((a,b)=>a-b);
  const cadence=intervals.length>=2?intervals[Math.floor((intervals.length-1)*.25)]:5;
  const gapThreshold=Math.max(7,cadence*1.5);let previous;
  rows.forEach((row,index)=>{
    const time=times[index];
    if(previous&&time-previous>gapThreshold){x.push(previous+cadence);y.push(null)}
    x.push(time);
    const invalidZeroReading=[row.pv_power_w,row.home_power_w,row.battery_power_w,row.grid_power_w,row.soc_pct].every(value=>value===0);
    y.push(!invalidZeroReading&&Number.isFinite(row.pv_power_w)&&row.pv_power_w!==0?row.pv_power_w:null);
    previous=time;
  });
  return[x,y];
}

if(typeof module!=='undefined')module.exports={solarHistoryData};

if(typeof document!=='undefined')(() => {
  const status=document.querySelector('#solar-history-status');
  const container=document.querySelector('#solar-history-chart');
  const REFRESH_MS=30000,REQUEST_TIMEOUT_MS=10000;
  let plot=null,samples=[],inFlight=false,timer=null;

  function rollingRange(){const end=Date.now()/1000;return[end-86400,end]}
  function labels(time){
    const date=new Date(time*1000);
    return date.toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false})+'\n'+date.toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit'});
  }
  function chartData(rows){
    return solarHistoryData(rows);
  }
  function draw(rows){
    samples=rows||[];
    if(!samples.length){if(plot)plot.setData([[],[]]);return}
    if(typeof uPlot==='undefined')throw new Error('No se pudo cargar el gráfico solar. Recargá la página.');
    const width=Math.max(1,container.clientWidth||800),height=Math.max(180,container.clientHeight||360),data=chartData(samples);
    const options={title:'',width,height,ms:1,scales:{x:{time:true,range:rollingRange},y:{auto:true}},series:[{},
      {label:'Generación solar',scale:'y',stroke:'#48c774',width:2,spanGaps:false,points:{show:true,size:3}},
    ],axes:[
      {scale:'x',size:42,stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'},splits:()=>{const end=rollingRange()[1];return[0,4,8,12,16,20,24].map(hours=>end-86400+hours*3600)},values:(_plot,splits)=>splits.map(labels)},
      {scale:'y',label:'Potencia solar (W)',stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'}},
    ]};
    if(plot){plot.setData(data);plot.setSize({width,height})}else plot=new uPlot(options,data,container);
  }
  async function refresh(){
    if(inFlight)return;
    inFlight=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch('/api/history?range=24h',{signal:controller.signal});
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('application/json'))throw new Error(`El servicio respondió ${response.status} sin datos JSON. Reiniciá el servicio.`);
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||'No se pudo cargar el historial solar');
      if(!Array.isArray(payload.samples))throw new Error('El servicio no devolvió el historial solar esperado. Reiniciá el servicio.');
      draw(payload.samples);
      status.textContent=samples.length?'':'Sin historial solar en las últimas 24 h.';
    }catch(error){
      const message=error.name==='AbortError'?'La consulta de historial solar agotó el tiempo de espera.':error.message;
      status.textContent=message;
    }finally{clearTimeout(timeout);inFlight=false}
  }
  function resize(){if(plot)plot.setSize({width:Math.max(1,container.clientWidth||800),height:Math.max(180,container.clientHeight||360)})}
  refresh();
  timer=setInterval(refresh,REFRESH_MS);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resize);observer.observe(container)}else window.addEventListener('resize',resize);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
