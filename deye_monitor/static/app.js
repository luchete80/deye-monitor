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
function nonZero(value){return known(value)&&value!==0?value:null}
function positiveNonZero(value){return known(value)&&value>0?value:null}
function batteryFlowState(value){
  if(!known(value))return 'unknown';
  if(value<0)return 'charging';
  if(value>0)return 'discharging';
  return 'idle';
}
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

const FlowLogic=(()=>{
  function direction(kind,value,deadband){
    if(!known(value)||Math.abs(value)<=deadband)return 0;
    if(kind==='pv'||kind==='load')return value>0?1:0;
    return value>0?1:-1;
  }
  function pathDirection(kind,semanticDirection){
    // SVG routes are drawn from each card toward the centre gap.
    return kind==='load'?-semanticDirection:semanticDirection;
  }
  function offline(connectivity={},simulated=false){
    return(!simulated&&connectivity.broker==='disconnected')||connectivity.service==='offline'||connectivity.logger==='offline';
  }
  function state(kind,value,deadband,fresh,connectivity,simulated){
    if(!known(value))return{status:'unknown',direction:0};
    if(offline(connectivity,simulated))return{status:'offline',direction:0};
    if(!fresh)return{status:'stale',direction:0};
    const flowDirection=direction(kind,value,deadband);
    return{status:flowDirection?'active':'idle',direction:flowDirection};
  }
  return{direction,pathDirection,offline,state};
})();

function setFlow(id,value,result,pathDirection,label){
  const line=document.querySelector(`#flow-${id}`);
  if(!line)return;
  line.setAttribute('class',`flow-line ${result.status}${pathDirection<0?' reverse':''}`);
  line.removeAttribute('marker-start');
  line.removeAttribute('marker-end');
  if(result.status==='active'&&pathDirection>0)line.setAttribute('marker-end','url(#flow-arrow)');
  if(result.status==='active'&&pathDirection<0)line.setAttribute('marker-start','url(#flow-arrow)');
  const suffix=result.status==='stale'?' · dato antiguo':result.status==='offline'?' · sin conexión':result.status==='unknown'?' · sin dato':'';
  line.setAttribute('aria-label',`${label}: ${known(value)?number(Math.abs(value)): 'Sin dato'}${suffix}`);
}

function renderFlow(snapshot){
  const deadband=snapshot.flow?.deadband_w??30;
  const simulated=snapshot.flow?.simulated===true;
  const connectivity=snapshot.connectivity||{};
  const source=path=>lookup(snapshot,path);
  const fresh=path=>lookup(snapshot,`field_freshness.${path}`)===true;
  const flows=[
    ['pv','solar.total_power_w','Sol → centro'],
    ['grid','grid.power_w','Red → centro'],
    ['battery','battery.power_w','centro → Bat'],
    ['load','load.total_power_w','centro → Casa'],
  ];
  flows.forEach(([id,path,forwardLabel])=>{
    const value=source(path);
    const result=FlowLogic.state(id,value,deadband,fresh(path),connectivity,simulated);
    const pathDirection=FlowLogic.pathDirection(id,result.direction);
    let label=forwardLabel;
    if(id==='grid'&&result.direction<0)label='centro → Red';
    if(id==='battery'&&result.direction>0)label='Bat → centro';
    setFlow(id,value,result,pathDirection,label);
  });
}

let dashboardConfig=null, energySummary=null, lastSnapshot=null, previousAlert=false, audioContext=null;

function homeDayScale(kwh,config){
  const first=config.home_day_scale_kwh,next=config.home_day_scale_next_kwh;
  return !known(kwh)||kwh<=first?first:kwh<=next?next:Math.ceil(kwh/first)*first;
}
function batteryDetails(snapshot,config){
  const soc=snapshot.battery?.soc_pct,raw=snapshot.battery?.power_w;
  const fresh=metricState(snapshot,'battery','soc_pct')==='online'&&metricState(snapshot,'battery','power_w')==='online';
  const deadband=snapshot.flow?.deadband_w??30;
  const charging=fresh&&raw < -deadband,discharging=fresh&&raw > deadband;
  const alert=fresh&&((soc<=config.soc_min&&!charging)||(soc>=config.soc_max&&charging));
  const fraction=metricState(snapshot,'battery','soc_pct')==='online'&&known(soc)?Math.min(1,Math.max(0,(soc-config.soc_min)/(config.soc_max-config.soc_min))):null;
  const available=known(config.battery_usable_kwh)&&fraction!==null?config.battery_usable_kwh*fraction:null;
  return {alert,available,fraction,flow:fresh?(charging?'charging':discharging?'discharging':'idle'):'unknown'};
}
function energyText(period){
  return known(period?.kwh)?`${number(period.kwh,'kWh')}${period.complete?'':''}`:'Sin historial suficiente';
}
function put(id,text){const element=document.querySelector(`#${id}`);if(element)element.textContent=text}
function renderMetrics(snapshot){
  lastSnapshot=snapshot;
  const batteryDetail=dashboardConfig?batteryDetails(snapshot,dashboardConfig):{available:null,fraction:null,alert:false,flow:'unknown'};
  for(const [group,field,unit] of [['solar','total_power_w','W'],['grid','power_w','W'],['battery','soc_pct','kWh'],['load','total_power_w','W']]){
    const state=metricState(snapshot,group,field),value=lookup(snapshot,`${group}.${field}`);
    const card=document.querySelector(`[data-metric="${group}"]`),gauge=document.querySelector(`[data-gauge="${group}"]`);
    if(card)card.dataset.state=state;
    const shownValue=group==='battery'?batteryDetail.available:value;
    put(`${group}-value`,valueText(shownValue));
    const maximum=group==='battery'?dashboardConfig?.battery_usable_kwh:dashboardConfig?.gauge_max_w[group];
    const percent=group==='battery'?gaugePercent(batteryDetail.available,maximum):gaugePercent(value,maximum,group==='grid');
    const progress=gauge?.querySelector('.metric-gauge__progress');
    if(progress)progress.style.strokeDashoffset=String(100-(percent??0));
    if(gauge){gauge.dataset.percent=percent===null?'':String(percent);gauge.setAttribute('aria-label',`${group}: ${number(shownValue,unit)} · ${stateLabel(state)}`)}
  }
  if(!dashboardConfig)return;
  const cfg=dashboardConfig;
put('solar-today', `Hoy:\n${known(energySummary?.solar_day?.kwh) ? number(energySummary.solar_day.kwh,'kWh') : '-'}`);
  const voltageState=metricState(snapshot,'grid','voltage_v');
  const absent=voltageState==='online'&&snapshot.grid.voltage_v<cfg.grid_absent_below_v;
  const grid=document.querySelector('[data-metric="grid"]');
  if(grid)grid.dataset.absent=String(absent);
  put('grid-top',absent?'Sin tensión':voltageState==='online'?number(snapshot.grid.voltage_v,'V'):'Tensión: sin dato');
  put('grid-bottom',cfg.billing_day===null?'Configurar día de facturación':`Ciclo: ${energyText(energySummary?.grid_billing)}`);
  const daily=energySummary?.home_day;
  put('load-top',`Hoy: ${energyText(daily)}`);
  put('load-bottom',`Mes: ${energyText(energySummary?.home_month)}`);
  const home=document.querySelector('[data-metric="load"]');
  if(home){home.dataset.energyScale=String(homeDayScale(daily?.kwh,cfg));const top=document.querySelector('#load-top');if(top){top.style.setProperty('--day-progress',`${gaugePercent(daily?.kwh,homeDayScale(daily?.kwh,cfg))??0}%`);top.title=`Escala diaria: ${homeDayScale(daily?.kwh,cfg)} kWh`;}}
  const detail=batteryDetail;
  const battery=document.querySelector('[data-metric="battery"]');
  if(battery){battery.dataset.batteryFlow=detail.flow;battery.dataset.alert=String(detail.alert)}
  if(detail.alert&&!previousAlert&&audioContext){
    const tone=audioContext.createOscillator(),gain=audioContext.createGain();
    tone.connect(gain);gain.connect(audioContext.destination);gain.gain.value=.08;tone.frequency.value=880;tone.start();tone.stop(audioContext.currentTime+.15);
  }
  previousAlert=detail.alert;
  put('home-last-month',`Mes anterior: ${energyText(energySummary?.home_last_month)}`);
  const counter=energySummary?.home_counter;
  put('home-counter',`Contador mensual: ${number(counter?.kwh,'kWh')}${counter?.reset_at?` · desde ${new Date(counter.reset_at).toLocaleString('es-AR',{timeZone:cfg.timezone})}`:''}`);
}

function renderAmbientTemperature(snapshot){
  for(const [field,selector,statusId,valueId,label] of [
    ['ambient_c','[data-ambient-temperature]','#ambient-status','#ambient-value','Temperatura ambiente'],
    ['ambient2_c','[data-ambient-temperature2]','#ambient2-status','#ambient2-value','Temperatura ambiente 2'],
  ]){
    const state=metricState(snapshot,'temperature',field);
    const value=lookup(snapshot,`temperature.${field}`);
    const card=document.querySelector(selector);
    const status=document.querySelector(statusId);
    const reading=document.querySelector(valueId);
    if(card)card.dataset.state=state;
    if(status)status.textContent=stateLabel(state);
    if(reading)reading.textContent=valueText(value);
    if(card)card.setAttribute('aria-label',`${label}: ${valueText(value)} °C · ${stateLabel(state)}`);
  }
}

function render(snapshot){
  document.querySelectorAll('[data-path]').forEach(element=>element.textContent=number(lookup(snapshot,element.dataset.path),element.dataset.unit));
  renderMetrics(snapshot);
  renderAmbientTemperature(snapshot);
  renderFlow(snapshot);
  const connectivity=snapshot.connectivity||{},connection=document.querySelector('#connection');
  connection.textContent=snapshot.flow?.simulated?'Simulado':connectivity.stale?'Datos antiguos / sin conexión':'Conectado';
  connection.className=connectivity.stale?'stale':'';
  document.querySelector('#age').textContent=`Última métrica: ${relativeAge(snapshot.data_observed_at)}${connectivity.stale?' (datos antiguos)':''}`;
}

async function initial(){
  try{
    dashboardConfig=await fetchJson('/api/dashboard-config','No se pudo cargar la configuración');
    const button=document.querySelector('#enable-beep');
    button.hidden=!dashboardConfig.beep_enabled;
    button.addEventListener('click',async()=>{
      if(audioContext){await audioContext.close();audioContext=null;button.textContent='Activar sonido';return;}
      audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();button.textContent='Silenciar';
    });
    document.querySelector('#reset-home').addEventListener('click',async()=>{
      try{
        const response=await fetch('/api/energy/home/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(!response.ok)throw new Error('No se pudo reiniciar el contador');
        energySummary=await response.json();if(lastSnapshot)renderMetrics(lastSnapshot);put('energy-status','Contador reiniciado');
      }catch(error){put('energy-status',error.message)}
    });
    render(await fetchJson('/api/state','No se pudo obtener el estado'));
  }
  catch(_){document.querySelector('#connection').textContent='No se pudo obtener el estado'}
}

function connect(){
  const source=new EventSource('/events');
  source.addEventListener('state',event=>render(JSON.parse(event.data)));
  source.onerror=()=>{document.querySelector('#connection').textContent='Reconectando actualizaciones…'};
}

let powerPlot;
let temperaturePlot;
let historySamples=[];
let temperatureSamples=[];
let historyRefreshTimer;
let historyRefreshInFlight=false;
const HISTORY_REFRESH_MS=5000;

function chartHeight(viewportHeight){
  const height=Number.isFinite(viewportHeight)?viewportHeight:typeof window!=='undefined'?window.innerHeight:900;
  return height<=800?140:300;
}

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
    const invalidZeroReading=[sample.pv_power_w,sample.home_power_w,sample.battery_power_w,sample.grid_power_w,sample.soc_pct].every(value=>value===0);
    columns[1].push(invalidZeroReading?null:nonZero(sample.pv_power_w));
    columns[2].push(invalidZeroReading?null:positiveNonZero(sample.grid_power_w));
    columns[3].push(invalidZeroReading?null:nonZero(sample.soc_pct));
    columns[4].push(invalidZeroReading?null:positiveNonZero(sample.home_power_w));
    previous=time;
  });
  return columns;
}

function temperatureData(samples){
  return [
    samples.map(sample=>new Date(sample.captured_at).getTime()/1000),
    samples.map(sample=>known(sample.ambient_c)?sample.ambient_c:null),
    samples.map(sample=>known(sample.ambient2_c)?sample.ambient2_c:null),
  ];
}

function todayRange(now=Date.now()){
  const start=new Date(now);
  start.setHours(0,0,0,0);
  const end=new Date(start);
  end.setDate(end.getDate()+1);
  return[start.getTime()/1000,end.getTime()/1000];
}

function dayHourSplits(){
  const [start]=todayRange();
  return [0,4,8,12,16,20,24].map(hour=>start+hour*60*60);
}

function rollingDayRange(now=Date.now()){
  const end=now/1000;
  return [end-24*60*60,end];
}

function localHourLabel(time){
  const date=new Date(time*1000),zone=dashboardConfig?.timezone||'America/Argentina/Buenos_Aires';
  return date.toLocaleTimeString('es-AR',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false})+'\n'+date.toLocaleDateString('es-AR',{timeZone:zone,day:'2-digit',month:'2-digit'});
}

function rollingDaySplits(){
  const [start]=rollingDayRange();
  return [0,4,8,12,16,20,24].map(hour=>start+hour*60*60);
}

function chartOptions(title,width,height){
  const solar=chartColor('--solar','#48c774'),grid=chartColor('--grid','#b279ff'),battery=chartColor('--battery','#55b9ed'),load=chartColor('--load','#f3c34f');
  return {
    title,width,height,ms:1,
    scales:{
      x:{time:true,range:()=>rollingDayRange()},
      y:{auto:true},battery:{range:[0,100]}
    },
    series:[{},
      {label:'Generación',scale:'y',stroke:solar,width:2},
      {label:'Consumo de Red',scale:'y',stroke:grid,width:2},
      {label:'Carga de batería',scale:'battery',stroke:battery,width:2},
      {label:'Consumo total',scale:'y',stroke:load,width:2}
    ],
    axes:[
      {scale:'x',size:40,font:'10px system-ui',stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'},splits:()=>rollingDaySplits(),values:(_plot,splits)=>splits.map(localHourLabel)},
      {scale:'y',label:'Potencia (W)',stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'}},
      {scale:'battery',label:'Carga batería (%)',side:1,stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'}}
    ]
  };
}

function temperatureChartOptions(title,width,height){
  return {
    title,width,height,ms:1,
    scales:{x:{time:true,range:()=>rollingDayRange()},y:{auto:true}},
    series:[{},
      {label:'Temperatura ambiente',scale:'y',stroke:'#f5c451',width:2,spanGaps:false,points:{show:true,size:4}},
      {label:'Temperatura ambiente 2',scale:'y',stroke:'#55b9ed',width:2,spanGaps:false,points:{show:true,size:4}},
    ],
    axes:[
      {scale:'x',size:40,font:'10px system-ui',stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'},splits:()=>rollingDaySplits(),values:(_plot,splits)=>splits.map(localHourLabel)},
      {scale:'y',label:'Temperatura (°C)',stroke:'#fff',ticks:{stroke:'#fff'},grid:{stroke:'#ffffff22'}},
    ],
  };
}

function renderHistory(samples){
  if(typeof uPlot==='undefined')return;
  const nextSamples=samples||[];
  const container=document.querySelector('#power-chart');
  historySamples=nextSamples;
  const width=Math.max(1,container.clientWidth||600),height=Math.max(80,container.clientHeight||chartHeight()),data=historyData(historySamples);
  if(powerPlot){
    powerPlot.setData(data);
    powerPlot.setSize({width,height});
    return;
  }
  powerPlot=new uPlot(chartOptions('',width,height),data,container);
}

function renderTemperatureHistory(samples){
  if(typeof uPlot==='undefined')return;
  const nextSamples=samples||[];
  const container=document.querySelector('#temperature-chart');
  temperatureSamples=nextSamples;
  const width=Math.max(1,container.clientWidth||500),height=Math.max(80,container.clientHeight||chartHeight()),data=temperatureData(temperatureSamples);
  if(temperaturePlot){
    temperaturePlot.setData(data);
    temperaturePlot.setSize({width,height});
    return;
  }
  temperaturePlot=new uPlot(temperatureChartOptions('',width,height),data,container);
}

async function fetchJson(url,description){
  const response=await fetch(url);
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('application/json')){
    throw new Error(`${description}: respuesta ${response.status} no válida. Reiniciá el servicio.`);
  }
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||description);
  return payload;
}

async function loadPowerHistory(initial){
  const status=document.querySelector('#history-status');
  if(initial)status.textContent='Cargando historial…';
  try{
    let payload=await fetchJson('/api/history?range=24h','No se pudo cargar el historial de potencia');
    renderHistory(payload.samples);
    if(payload.samples.length)status.textContent=payload.demo?'Datos demo':'';
    else status.textContent='Sin historial de potencia en las últimas 24 h.';
  }catch(error){
    if(initial||!historySamples.length)status.textContent=error.message;
  }
}

async function loadTemperatureHistory(initial){
  const status=document.querySelector('#temperature-history-status');
  if(initial)status.textContent='Cargando historial de temperatura…';
  try{
    let payload=await fetchJson('/api/history/temperature?range=24h','No se pudo cargar el historial de temperatura');
    renderTemperatureHistory(payload.samples);
    if(payload.samples.length)status.textContent=payload.demo?'Datos demo':'';
    else status.textContent='Sin historial de temperatura en las últimas 24 h.';
  }catch(error){
    if(initial||!temperatureSamples.length)status.textContent=error.message;
  }
}

async function loadHistory(initial=false){
  if(historyRefreshInFlight)return;
  historyRefreshInFlight=true;
  try{
    await Promise.all([loadPowerHistory(initial),loadTemperatureHistory(initial),loadEnergy()]);
  }finally{historyRefreshInFlight=false}
}

async function loadEnergy(){try{energySummary=await fetchJson('/api/energy','No se pudo cargar energía');if(lastSnapshot)renderMetrics(lastSnapshot)}catch(error){put('energy-status',error.message)}}

function startHistoryRefresh(){
  if(historyRefreshTimer)return;
  loadHistory(true);
  historyRefreshTimer=setInterval(()=>loadHistory(false),HISTORY_REFRESH_MS);
}

function resizePlot(){
  if(powerPlot){
    const container=document.querySelector('#power-chart');
    powerPlot.setSize({width:Math.max(1,container.clientWidth||500),height:Math.max(80,container.clientHeight||chartHeight())});
  }
  if(temperaturePlot){
    const container=document.querySelector('#temperature-chart');
    temperaturePlot.setSize({width:Math.max(1,container.clientWidth||500),height:Math.max(80,container.clientHeight||chartHeight())});
  }
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
  if(typeof ResizeObserver!=='undefined'){
    const historyResizeObserver=new ResizeObserver(resizePlot);
    historyResizeObserver.observe(document.querySelector('#power-chart'));
    historyResizeObserver.observe(document.querySelector('#temperature-chart'));
  }
  else window.addEventListener('resize',resizePlot);
}

if(typeof module!=='undefined')module.exports={batteryDetails,homeDayScale,known,lookup,number,valueText,positivePower,nonZero,positiveNonZero,batteryFlowState,gaugePercent,metricState,historyData,temperatureData,todayRange,dayHourSplits,rollingDayRange,rollingDaySplits,chartOptions,temperatureChartOptions,FlowLogic,chartHeight};
