const known=value=>typeof value==='number'&&Number.isFinite(value);
const lookup=(state,path)=>path.split('.').reduce((value,key)=>value?.[key],state);
const number=(value,unit='W')=>value===null||value===undefined?'Sin dato':`${Number(value).toLocaleString('es-AR',{maximumFractionDigits:2})} ${unit}`;
const valueText=value=>value===null||value===undefined?'Sin dato':Number(value).toLocaleString('es-AR',{maximumFractionDigits:2});

function relativeAge(timestamp){
  if(!timestamp)return 'Sin datos';
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/1000));
  if(seconds<60)return `hace ${seconds} s`;
  if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;
  if(seconds<86400)return `hace ${Math.floor(seconds/3600)} h`;
  return `hace ${Math.floor(seconds/86400)} d`;
}

function positivePower(value){return known(value)?Math.max(0,value):null}
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
  const metrics=[['solar','total_power_w','solar-value'],['grid','power_w','grid-value'],['battery','power_w','battery-value'],['load','total_power_w','load-value']];
  metrics.forEach(([group,field,valueId])=>{
    const state=metricState(snapshot,group,field),card=document.querySelector(`[data-metric="${group}"]`),status=document.querySelector(`#${group}-status`),value=lookup(snapshot,`${group}.${field}`);
    if(card)card.dataset.state=state;
    if(status)status.textContent=stateLabel(state);
    const element=document.querySelector(`#${valueId}`);
    if(element)element.textContent=valueText(value);
  });
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

function historyData(samples){
  const columns=[[],[],[],[],[]];
  let previous;
  for(const sample of samples){
    const time=new Date(sample.captured_at).getTime()/1000;
    if(previous&&time-previous>7){
      columns[0].push(previous+5);
      for(let index=1;index<columns.length;index++)columns[index].push(null);
    }
    columns[0].push(time);
    columns[1].push(sample.pv_power_w);
    columns[2].push(positivePower(sample.grid_power_w));
    columns[3].push(positivePower(sample.battery_power_w));
    columns[4].push(sample.home_power_w);
    previous=time;
  }
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
  historySamples=samples||[];
  const container=document.querySelector('#power-chart');
  powerPlot?.destroy();
  powerPlot=null;
  if(!historySamples.length)return;
  const width=Math.max(240,container.clientWidth||600),data=historyData(historySamples);
  powerPlot=new uPlot(chartOptions('Potencia de las últimas 24 horas',width,300),data,container);
}

async function loadHistory(){
  const status=document.querySelector('#history-status');
  status.textContent='Cargando historial…';
  try{
    const response=await fetch('/api/history?range=24h'),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'No se pudo cargar el historial');
    renderHistory(payload.samples);
    status.textContent=payload.samples.length?`${payload.samples.length.toLocaleString('es-AR')} muestras completas`:'Aún no hay muestras completas para este rango.';
  }catch(error){status.textContent=error.message}
}

function resizePlot(){
  if(!powerPlot)return;
  const container=document.querySelector('#power-chart');
  powerPlot.setSize({width:Math.max(240,container.clientWidth||600),height:300});
}

if(typeof document!=='undefined'){
  initial();
  connect();
  loadHistory();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizePlot).observe(document.querySelector('#power-chart'));
  else window.addEventListener('resize',resizePlot);
}

if(typeof module!=='undefined')module.exports={known,lookup,number,valueText,positivePower,metricState,historyData,chartOptions};
