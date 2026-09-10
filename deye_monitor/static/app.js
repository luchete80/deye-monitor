const known=value=>typeof value==='number'&&Number.isFinite(value);
const lookup=(state,path)=>path.split('.').reduce((value,key)=>value?.[key],state);
const number=(value,unit='W')=>value===null||value===undefined?'Sin dato':`${Number(value).toLocaleString('es-AR',{maximumFractionDigits:2})} ${unit}`;
const valueText=value=>value===null||value===undefined?'Sin dato':Number(value).toLocaleString('es-AR',{maximumFractionDigits:2});
const currentText=value=>known(value)?`${Number(value).toLocaleString('es-AR',{maximumFractionDigits:2})} A`:'Sin dato';

function relativeAge(timestamp){
  if(!timestamp)return 'Sin datos';
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/1000));
  if(seconds<60)return `hace ${seconds} s`;
  if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;
  if(seconds<86400)return `hace ${Math.floor(seconds/3600)} h`;
  return `hace ${Math.floor(seconds/86400)} d`;
}

function positivePower(value){return known(value)?Math.max(0,value):null}
const GAUGE_MAX_W={solar:6000,grid:6000,battery:6000,load:6000};
function gaugePercent(value,maximum,absolute=false){
  if(!known(value)||!known(maximum)||maximum<=0)return null;
  const magnitude=absolute?Math.abs(value):Math.max(0,value);
  return Math.min(100,Math.max(0,magnitude/maximum*100));
}
function chartColor(variable,fallback){
  if(typeof document==='undefined')return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()||fallback;
}

function metricState(snapshot,group,field){
  const value=lookup(snapshot,`${group}.${field}`);
  if(!known(value))return 'unknown';
  if((!snapshot.flow?.simulated&&snapshot.connectivity?.broker==='disconnected')||snapshot.connectivity?.service==='offline'||snapshot.connectivity?.logger==='offline')return 'offline';
  return lookup(snapshot,`field_freshness.${group}.${field}`)===true?'online':'stale';
}

function stateLabel(state){return {online:'Actualizado',stale:'Dato antiguo',offline:'Sin conexión',unknown:'Sin dato'}[state]||'Sin dato'}

function renderMetrics(snapshot){
  const metrics=[
    {group:'solar',field:'total_power_w',valueId:'solar-value',currentId:'solar-current',absolute:false},
    {group:'grid',field:'power_w',valueId:'grid-value',currentField:'estimated_current_a',currentId:'grid-current',absolute:true},
    {group:'battery',field:'power_w',valueId:'battery-value',currentField:'current_a',currentId:'battery-current',absolute:true},
    {group:'load',field:'total_power_w',valueId:'load-value',currentField:'current_a',currentId:'load-current',absolute:false},
  ];
  metrics.forEach(({group,field,valueId,currentId,currentField,absolute})=>{
    const state=metricState(snapshot,group,field),card=document.querySelector(`[data-metric="${group}"]`),status=document.querySelector(`#${group}-status`),value=lookup(snapshot,`${group}.${field}`);
    if(card)card.dataset.state=state;
    if(status)status.textContent=stateLabel(state);
    const element=document.querySelector(`#${valueId}`);
    if(element)element.textContent=valueText(value);
    const currentElement=document.querySelector(`#${currentId}`);
    const currentLabel=group==='solar'?solarCurrentText(snapshot):currentText(lookup(snapshot,`${group}.${currentField}`));
    const currentState=group==='solar'?solarCurrentState(snapshot):metricState(snapshot,group,currentField);
    if(currentElement)currentElement.textContent=currentLabel;
    if(card)card.dataset.currentState=currentState;
    const gauge=document.querySelector(`[data-gauge="${group}"]`),progress=gauge?.querySelector('.metric-gauge__progress');
    const percent=gaugePercent(value,GAUGE_MAX_W[group],absolute);
    if(progress)progress.style.strokeDashoffset=String(100-(percent??0));
    if(gauge){
      gauge.dataset.percent=percent===null?'':String(percent);
      gauge.setAttribute('aria-label',`${group==='load'?'UPS / Casa':group==='solar'?'Paneles':group==='battery'?'Batería':'Grid'}: ${valueText(value)} W · Corriente: ${currentLabel} · ${stateLabel(state)}`);
    }
  });
}

function solarCurrentValues(snapshot){
  return [lookup(snapshot,'solar.pv1_current_a'),lookup(snapshot,'solar.pv2_current_a')];
}

function solarCurrentText(snapshot){
  const [pv1,pv2]=solarCurrentValues(snapshot);
  return known(pv1)&&known(pv2)?`PV1 ${currentText(pv1)} · PV2 ${currentText(pv2)}`:'Sin dato';
}

function solarCurrentState(snapshot){
  const [pv1,pv2]=solarCurrentValues(snapshot);
  if(!known(pv1)||!known(pv2))return 'unknown';
  const states=[metricState(snapshot,'solar','pv1_current_a'),metricState(snapshot,'solar','pv2_current_a')];
  return states.includes('offline')?'offline':states.includes('stale')?'stale':'online';
}

function render(snapshot){
  document.querySelectorAll('[data-path]').forEach(element=>element.textContent=number(lookup(snapshot,element.dataset.path),element.dataset.unit));
  renderMetrics(snapshot);
  const connectivity=snapshot.connectivity||{},connection=document.querySelector('#connection');
  connection.textContent=snapshot.flow?.simulated?'Fuente: simulada':`Broker: ${connectivity.broker} · Servicio: ${connectivity.service} · Logger: ${connectivity.logger}`;
  connection.className=connectivity.stale?'stale':'';
  document.querySelector('#age').textContent=`Última métrica: ${relativeAge(snapshot.data_observed_at)}${connectivity.stale?' (datos antiguos)':''}`;
}

async function initial(){
  try{render(await(await fetch('/api/state')).json())}
  catch(_){document.querySelector('#connection').textContent='No se pudo obtener el estado'}
}

function connect(){
  const source=new EventSource('/events');
  source.addEventListener('state',event=>render(JSON.parse(event.data)));
  source.onerror=()=>{document.querySelector('#connection').textContent='Reconectando actualizaciones…'};
}

let powerPlot;
let historySamples=[];
let historyRefreshTimer;
let historyRefreshInFlight=false;
const HISTORY_REFRESH_MS=5000;

function historyData(samples){
  const columns=[[],[],[],[],[]];
  const times=samples.map(sample=>new Date(sample.captured_at).getTime()/1000);
  const intervals=times.slice(1).map((time,index)=>time-times[index]).filter(interval=>interval>0).sort((a,b)=>a-b);
  const cadence=intervals.length>=2?intervals[Math.floor((intervals.length-1)*.25)]:5;
  const gapThreshold=Math.max(7,cadence*1.5);
  let previous;
  samples.forEach((sample,index)=>{
    const time=times[index];
    if(previous&&time-previous>gapThreshold){
      columns[0].push(previous+cadence);
      for(let index=1;index<columns.length;index++)columns[index].push(null);
    }
    columns[0].push(time);
    columns[1].push(sample.pv_power_w);
    columns[2].push(positivePower(sample.grid_power_w));
    columns[3].push(positivePower(sample.battery_power_w));
    columns[4].push(sample.home_power_w);
    previous=time;
  });
  return columns;
}

function chartOptions(title,width,height){
  const solar=chartColor('--solar','#48c774'),grid=chartColor('--grid','#b279ff'),battery=chartColor('--battery','#55b9ed'),load=chartColor('--load','#f3c34f');
  return {
    title,width,height,ms:1,
    scales:{x:{time:true},y:{auto:true},battery:{auto:true}},
    series:[{},
      {label:'Generación',scale:'y',stroke:solar,width:2},
      {label:'Consumo de Grid',scale:'y',stroke:grid,width:2},
      {label:'Carga de batería',scale:'battery',stroke:battery,width:2},
      {label:'Consumo total',scale:'y',stroke:load,width:2}
    ],
    axes:[
      {scale:'x'},
      {scale:'y',label:'Potencia (W)'},
      {scale:'battery',label:'Carga batería (W)',side:1}
    ]
  };
}

function renderHistory(samples){
  if(typeof uPlot==='undefined')return;
  const nextSamples=samples||[];
  const container=document.querySelector('#power-chart');
  if(!nextSamples.length){
    // Keep the last valid plot visible during a transient empty response.
    if(!powerPlot)historySamples=[];
    return;
  }
  historySamples=nextSamples;
  const width=Math.max(240,container.clientWidth||600),data=historyData(historySamples);
  if(powerPlot){
    powerPlot.setData(data);
    powerPlot.setSize({width,height:300});
    return;
  }
  powerPlot=new uPlot(chartOptions('Potencia de las últimas 24 horas',width,300),data,container);
}

async function loadHistory(initial=false){
  if(historyRefreshInFlight)return;
  historyRefreshInFlight=true;
  const status=document.querySelector('#history-status');
  if(initial)status.textContent='Cargando historial…';
  try{
    const response=await fetch('/api/history?range=24h'),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'No se pudo cargar el historial');
    renderHistory(payload.samples);
    status.textContent=payload.samples.length?`${payload.samples.length.toLocaleString('es-AR')} muestras completas`:'Aún no hay muestras completas para este rango.';
  }catch(error){
    if(initial||!historySamples.length)status.textContent=error.message;
  }finally{historyRefreshInFlight=false}
}

function startHistoryRefresh(){
  if(historyRefreshTimer)return;
  loadHistory(true);
  historyRefreshTimer=setInterval(()=>loadHistory(false),HISTORY_REFRESH_MS);
}

function resizePlot(){
  if(!powerPlot)return;
  const container=document.querySelector('#power-chart');
  powerPlot.setSize({width:Math.max(240,container.clientWidth||600),height:300});
}

if(typeof document!=='undefined'){
  initial();
  connect();
  startHistoryRefresh();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')loadHistory(false);
  });
  window.addEventListener('beforeunload',()=>{
    if(historyRefreshTimer)clearInterval(historyRefreshTimer);
    historyRefreshTimer=null;
  },{once:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizePlot).observe(document.querySelector('#power-chart'));
  else window.addEventListener('resize',resizePlot);
}

if(typeof module!=='undefined')module.exports={known,lookup,number,valueText,positivePower,gaugePercent,metricState,historyData,chartOptions};
