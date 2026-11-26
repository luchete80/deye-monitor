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
  function transition(kind,value,deadband,fresh,connectivity,simulated,previous){
    const current=state(kind,value,deadband,fresh,connectivity,simulated);
    if(previous?.status!=='active'||current.status==='stale'||current.status==='offline'||current.status==='unknown')return current;
    const sign=value>0?1:value<0?-1:0;
    if(sign!==previous.direction)return current.status==='active'?current:{status:'idle',direction:0};
    if(Math.abs(value)<=deadband/2)return{status:'idle',direction:0};
    return{status:'active',direction:previous.direction};
  }
  function bridge(results,values,deadband,previousDirection=0){
    const active=id=>results[id]?.status==='active';
    const pv=active('pv')&&values.pv>0?values.pv:0;
    const grid=active('grid')?values.grid:0;
    const battery=active('battery')?values.battery:0;
    const load=active('load')&&values.load>0?values.load:0;
    const upperNet=pv+grid,lowerNet=battery-load;
    const downSupport=(active('pv')&&values.pv>0||active('grid')&&values.grid>0)&&
      (active('battery')&&values.battery<0||active('load')&&values.load>0);
    const upSupport=active('grid')&&values.grid<0&&active('battery')&&values.battery>0;
    const candidate=downSupport&&upperNet>deadband&&lowerNet < -deadband?1:
      upSupport&&upperNet < -deadband&&lowerNet>deadband?-1:0;
    if(previousDirection){
      const support=previousDirection>0?downSupport:upSupport;
      const sameSide=previousDirection>0?upperNet>0&&lowerNet<0:upperNet<0&&lowerNet>0;
      if(support&&sameSide&&Math.abs(upperNet)>deadband/2&&Math.abs(lowerNet)>deadband/2)
        return{active:true,direction:previousDirection,upperNet,lowerNet};
    }
    return{active:candidate!==0,direction:candidate,upperNet,lowerNet};
  }
  return{direction,pathDirection,offline,state,transition,bridge};
})();

const flowBranchState={pv:null,grid:null,battery:null,load:null};
let flowTrunkDirection=0;
function setFlow(id,value,result,pathDirection,label){
  const line=document.querySelector(`#flow-${id}`);
  if(!line)return;
  line.setAttribute('class',`flow-line ${result.status}${pathDirection<0?' reverse':''}`);
  const cable=document.querySelector(`#flow-cable-${id}`);
  if(cable)cable.setAttribute('class',`flow-cable ${result.status}${pathDirection<0?' reverse':''}`);
  const pulse=document.querySelector(`#flow-${id}-pulse`);
  if(pulse)pulse.setAttribute('class',`flow-pulse ${result.status}${pathDirection<0?' reverse':''}`);
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
    ['pv','solar.total_power_w','Sol → Inversor'],
    ['grid','grid.power_w','Red → Inversor'],
    ['battery','battery.power_w','Inversor → Batería'],
    ['load','load.total_power_w','Inversor → Casa'],
  ];
  const results={};
  flows.forEach(([id,path,forwardLabel])=>{
    const value=source(path);
    const result=FlowLogic.transition(id,value,deadband,fresh(path),connectivity,simulated,flowBranchState[id]);
    flowBranchState[id]=result;
    results[id]=result;
    const pathDirection=FlowLogic.pathDirection(id,result.direction);
    let label=forwardLabel;
    if(id==='grid'&&result.direction<0)label='Inversor → Red';
    if(id==='battery'&&result.direction>0)label='Batería → Inversor';
    setFlow(id,value,result,pathDirection,label);
  });
  const values={pv:source('solar.total_power_w'),grid:source('grid.power_w'),battery:source('battery.power_w'),load:source('load.total_power_w')};
  const bridge=FlowLogic.bridge(results,values,deadband,flowTrunkDirection);
  flowTrunkDirection=bridge.direction;
  const trunk=document.querySelector('#flow-trunk');
  if(trunk){
    const upward=bridge.active&&bridge.direction<0;
    const status=bridge.active?'active':'idle';
    trunk.setAttribute('class',`flow-line ${status}${upward?' reverse':''}`);
    const trunkCable=document.querySelector('#flow-cable-trunk');
    if(trunkCable)trunkCable.setAttribute('class',`flow-cable ${status}${upward?' reverse':''}`);
    const pulse=document.querySelector('#flow-trunk-pulse');
    if(pulse)pulse.setAttribute('class',`flow-pulse ${status}${upward?' reverse':''}`);
    trunk.setAttribute('aria-label',`Flujo central: ${bridge.direction>0?'hacia batería y casa':upward?'hacia red':'en reposo'}`);
  }
}

let dashboardConfig=null, energySummary=null, lastSnapshot=null, previousAlert=false, audioContext=null;
const dashboardValue=value=>known(value)?valueText(value):'-';

function homeDayScale(kwh,config){
  const first=config.home_day_scale_kwh,next=config.home_day_scale_next_kwh;
  return !known(kwh)||kwh<=first?first:kwh<=next?next:Math.ceil(kwh/first)*first;
}
function batteryDetails(snapshot,config){
  const soc=snapshot.battery?.soc_pct,raw=snapshot.battery?.power_w;
  const fresh=metricState(snapshot,'battery','soc_pct')==='online'&&metricState(snapshot,'battery','power_w')==='online';
  const powerFresh=metricState(snapshot,'battery','power_w')==='online';
  const deadband=snapshot.flow?.deadband_w??30;
  const charging=fresh&&raw < -deadband,discharging=fresh&&raw > deadband;
  const alert=fresh&&((soc<=config.soc_min&&!charging)||(soc>=config.soc_max&&charging));
  const fraction=metricState(snapshot,'battery','soc_pct')==='online'&&known(soc)?Math.min(1,Math.max(0,(soc-config.soc_min)/(config.soc_max-config.soc_min))):null;
  const available=known(config.battery_usable_kwh)&&fraction!==null?config.battery_usable_kwh*fraction:null;
  const flow=powerFresh?(raw < -deadband?'charging':raw > deadband?'discharging':'idle'):'unknown';
  return {alert,available,fraction,flow};
}
function put(id,text){const element=document.querySelector(`#${id}`);if(element)element.textContent=text}
function appendUnit(element,unit){const suffix=document.createElement('span');suffix.className='detail-unit';suffix.textContent=` ${unit}`;element.append(suffix)}
function putDetail(id,label,value,unit=''){
  const element=document.querySelector(`#${id}`);if(!element)return;
  element.replaceChildren();
  if(label)element.append(document.createTextNode(label));
  element.append(document.createTextNode(value));
  if(unit&&value!=='-'&&value!=='Sin historial suficiente')appendUnit(element,unit);
}
function appendMeasurement(element,value,unit){
  element.append(document.createTextNode(value));
  appendUnit(element,unit);
}
function renderStationDetails(snapshot){
  const power=(group,field)=>metricState(snapshot,group,field)==='online'?dashboardValue(lookup(snapshot,`${group}.${field}`)):'-';
  const current=(group,field)=>metricState(snapshot,group,field)==='online'?dashboardValue(lookup(snapshot,`${group}.${field}`)):'-';
  const pv1w=power('solar','pv1_power_w'),pv1a=current('solar','pv1_current_a');
  const pv2w=power('solar','pv2_power_w'),pv2a=current('solar','pv2_current_a');
  const solarDetails=document.querySelector('#solar-details');
  if(solarDetails){
    solarDetails.replaceChildren();
    solarDetails.append(document.createTextNode('PV1: '));appendMeasurement(solarDetails,pv1w,'W');
    solarDetails.append(document.createTextNode(' · '));appendMeasurement(solarDetails,pv1a,'A');
    solarDetails.append(document.createElement('br'),document.createTextNode('PV2: '));appendMeasurement(solarDetails,pv2w,'W');
    solarDetails.append(document.createTextNode(' · '));appendMeasurement(solarDetails,pv2a,'A');
  }
  putDetail('load-current','',current('load','current_a'),'A');
  put('battery-current',current('battery','current_a'));
}
function renderMetrics(snapshot){
  lastSnapshot=snapshot;
  const batteryDetail=dashboardConfig?batteryDetails(snapshot,dashboardConfig):{available:null,fraction:null,alert:false,flow:'unknown'};
  for(const [group,field,unit] of [['solar','total_power_w','W'],['grid','power_w','W'],['battery','power_w','W'],['load','total_power_w','W']]){
    const state=metricState(snapshot,group,field),value=lookup(snapshot,`${group}.${field}`);
    const card=document.querySelector(`[data-metric="${group}"]`),gauge=document.querySelector(`[data-gauge="${group}"]`);
    if(card)card.dataset.state=state;
    if(group==='battery'){
      const soc=snapshot.battery?.soc_pct;
      put('battery-value',dashboardValue(batteryDetail.available));
      put('battery-soc',dashboardValue(soc));
      put('battery-power',dashboardValue(value));
    }else put(`${group}-value`,dashboardValue(value));
    if(group==='battery'){
      const chargeFraction=metricState(snapshot,'battery','soc_pct')==='online'?Math.min(1,Math.max(0,snapshot.battery.soc_pct/100)):null;
      if(gauge){
        gauge.dataset.chargeFraction=chargeFraction===null?'':String(chargeFraction);
        const powerPercent=state==='online'?gaugePercent(value,dashboardConfig?.gauge_max_w?.battery??6000,true):0;
        gauge.querySelector('.metric-gauge__level')?.setAttribute('stroke-dasharray',`${powerPercent??0} 100`);
        const powerLevel=gauge.querySelector('.metric-gauge__level');
        if(powerLevel)powerLevel.style.visibility=powerPercent>0?'visible':'hidden';
        const segments=[...gauge.querySelectorAll('.battery-segment')];
        const activeCount=chargeFraction===null?0:Math.round(chargeFraction*segments.length);
        segments.forEach((segment,index)=>{
          segment.classList.toggle('active',index<activeCount);
          segment.classList.toggle('charging-tip',batteryDetail.flow==='charging'&&activeCount>0&&index===activeCount-1);
        });
        gauge.dataset.flow=batteryDetail.flow;
        gauge.setAttribute('aria-label',`Batería: ${dashboardValue(snapshot.battery?.soc_pct)} % · ${dashboardValue(batteryDetail.available)} kWh · ${stateLabel(state)}`);
      }
    }
    if(gauge&&group!=='battery'){
      gauge.setAttribute('aria-label',`${group}: ${dashboardValue(value)} ${unit} · ${stateLabel(state)}`);
      const maximum=dashboardConfig?.gauge_max_w?.[group]??6000;
      const percent=state==='online'?gaugePercent(value,maximum,true):0;
      const level=gauge.querySelector('.metric-gauge__level');
      if(level){
        level.setAttribute('stroke-dasharray',`${percent} 100`);
        level.style.visibility=percent>0?'visible':'hidden';
      }
    }
  }
  renderStationDetails(snapshot);
  if(!dashboardConfig)return;
  const cfg=dashboardConfig;
  putDetail('solar-today','Hoy: ',known(energySummary?.solar_day?.kwh)?dashboardValue(energySummary.solar_day.kwh):'-','kWh');
  const voltageState=metricState(snapshot,'grid','voltage_v');
  const absent=voltageState==='online'&&snapshot.grid.voltage_v<cfg.grid_absent_below_v;
  const grid=document.querySelector('[data-metric="grid"]');
  if(grid)grid.dataset.absent=String(absent);
  if(absent)put('grid-top','Sin tensión');
  else putDetail('grid-top','',voltageState==='online'?dashboardValue(snapshot.grid.voltage_v):'-','V');
  const bought=metricState(snapshot,'grid','energy_bought_today_kwh')==='online'?dashboardValue(snapshot.grid.energy_bought_today_kwh):'-';
  putDetail('grid-today','Hoy: ',bought,'kWh');
  const gridBilling=energySummary?.grid_billing;
  if(cfg.billing_day===null)put('grid-bottom','');
  else putDetail('grid-bottom','Ciclo: ',known(gridBilling?.kwh)?dashboardValue(gridBilling.kwh):'Sin historial suficiente',known(gridBilling?.kwh)?'kWh':'');
  const daily=energySummary?.home_day;
  putDetail('load-top','Hoy: ',known(daily?.kwh)?dashboardValue(daily.kwh):'Sin historial suficiente',known(daily?.kwh)?'kWh':'');
  const homeMonth=energySummary?.home_month;
  putDetail('load-bottom','Mes: ',known(homeMonth?.kwh)?dashboardValue(homeMonth.kwh):'Sin historial suficiente',known(homeMonth?.kwh)?'kWh':'');
  const detail=batteryDetail;
  const battery=document.querySelector('[data-metric="battery"]');
  if(battery){battery.dataset.batteryFlow=detail.flow;battery.dataset.alert=String(detail.alert)}
  if(detail.alert&&!previousAlert&&audioContext){
    const tone=audioContext.createOscillator(),gain=audioContext.createGain();
    tone.connect(gain);gain.connect(audioContext.destination);gain.gain.value=.08;tone.frequency.value=880;tone.start();tone.stop(audioContext.currentTime+.15);
  }
  previousAlert=detail.alert;
  const homeLastMonth=energySummary?.home_last_month;
  putDetail('home-last-month','Mes anterior: ',known(homeLastMonth?.kwh)?dashboardValue(homeLastMonth.kwh):'Sin historial suficiente',known(homeLastMonth?.kwh)?'kWh':'');
  const counter=energySummary?.home_counter;
  putDetail('home-counter','Contador mensual: ',known(counter?.kwh)?dashboardValue(counter.kwh):'-','kWh');
  put('home-reset-at',`Último reset: ${counter?.reset_at?new Date(counter.reset_at).toLocaleString('es-AR',{timeZone:cfg.timezone}):'sin dato'}`);
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
    if(reading)reading.textContent=known(value)?valueText(value):'−';
    if(card)card.setAttribute('aria-label',`${label}: ${valueText(value)} °C · ${stateLabel(state)}`);
  }
}

function render(snapshot){
  renderConnectionStatus();
  document.querySelectorAll('[data-path]').forEach(element=>element.textContent=number(lookup(snapshot,element.dataset.path),element.dataset.unit));
  renderMetrics(snapshot);
  renderAmbientTemperature(snapshot);
  renderThermotankSetpoint?.(snapshot);
  renderFlow(snapshot);

}

// Agrupa las ráfagas MQTT y dibuja solamente el estado más reciente.
let renderTimer=null;
function scheduleRender(snapshot){
  lastSnapshot=snapshot;
  if(renderTimer!==null)return;
  renderTimer=setTimeout(()=>{
    renderTimer=null;
    render(lastSnapshot);
  },1000);
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
        energySummary=await fetchJson('/api/energy/home/reset','No se pudo reiniciar el contador',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(lastSnapshot)scheduleRender(lastSnapshot);put('energy-status','Contador reiniciado');
      }catch(error){put('energy-status',error.message)}
    });
    scheduleRender(await fetchJson('/api/state','No se pudo obtener el estado'));
    await loadEnergy();
  }
  catch(_){console.error('No se pudo obtener el estado')}
}

const SSE_TIMEOUT_MS=30000;
let serverDisconnected=false;

function renderConnectionStatus(){
  const connectivity=lastSnapshot?.connectivity;
  let message='';
  if(serverDisconnected)message='Sin conexión con el servidor';
  else if(connectivity?.broker==='disconnected'&&!lastSnapshot.flow?.simulated)message='MQTT desconectado';
  else if(connectivity?.broker==='connected'&&connectivity.stale)message='Datos del inversor sin actualizar';
  const status=document.querySelector('#connection-status');
  if(status&&status.textContent!==message)status.textContent=message;
}

function connect(){
  const source=new EventSource('/events');
  const markDisconnected=()=>{
    serverDisconnected=true;
    renderConnectionStatus();
  };
  let watchdog=setTimeout(markDisconnected,SSE_TIMEOUT_MS);
  source.addEventListener('state',event=>{
    const snapshot=JSON.parse(event.data);
    clearTimeout(watchdog);
    watchdog=setTimeout(markDisconnected,SSE_TIMEOUT_MS);
    serverDisconnected=false;
    scheduleRender(snapshot);
  });
  source.onerror=markDisconnected;
  return ()=>{
    clearTimeout(watchdog);
    source.close();
  };
}

let temperaturePlot;
let temperatureSamples=[];
let historyRefreshTimer;
let historyRefreshInFlight=false;
const HISTORY_REFRESH_MS=30000;
let energyRefreshTimer;
let energyRefreshInFlight=false;
const ENERGY_REFRESH_MS=5000;

async function runGuarded(readInFlight,writeInFlight,operation){
  if(readInFlight())return;
  writeInFlight(true);
  try{return await operation()}
  finally{writeInFlight(false)}
}

function chartHeight(viewportHeight){
  const height=Number.isFinite(viewportHeight)?viewportHeight:typeof window!=='undefined'?window.innerHeight:900;
  return height<=800?140:300;
}

function temperatureData(samples){
  return [
    samples.map(sample=>new Date(sample.captured_at).getTime()/1000),
    samples.map(sample=>known(sample.ambient_c)?sample.ambient_c:null),
    samples.map(sample=>known(sample.ambient2_c)?sample.ambient2_c:null),
  ];
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

function temperatureChartOptions(title,width,height){
  return {
    title,width,height,ms:1,
    scales:{x:{time:true,range:()=>rollingDayRange()},y:{range:[0,100]}},
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

async function fetchJson(url,description,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.includes('application/json')){
      throw new Error(`${description}: respuesta ${response.status} no válida. Reiniciá el servicio.`);
    }
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||description);
    return payload;
  }catch(error){
    if(error.name==='AbortError')throw new Error(`${description}: tiempo de espera agotado.`);
    throw error;
  }finally{clearTimeout(timeout)}
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
  return runGuarded(()=>historyRefreshInFlight,value=>{historyRefreshInFlight=value},async()=>{
    await loadTemperatureHistory(initial);
  });
}

async function loadEnergy(){
  return runGuarded(()=>energyRefreshInFlight,value=>{energyRefreshInFlight=value},async()=>{
    try{energySummary=await fetchJson('/api/energy','No se pudo cargar energía');if(lastSnapshot)scheduleRender(lastSnapshot)}
    catch(error){put('energy-status',error.message)}
  });
}

function startEnergyRefresh(){
  if(energyRefreshTimer)return;
  loadEnergy();
  energyRefreshTimer=setInterval(loadEnergy,ENERGY_REFRESH_MS);
}

function startHistoryRefresh(){
  if(historyRefreshTimer)return;
  loadHistory(true);
  historyRefreshTimer=setInterval(()=>loadHistory(false),HISTORY_REFRESH_MS);
}

function resizePlot(){
  if(temperaturePlot){
    const container=document.querySelector('#temperature-chart');
    temperaturePlot.setSize({width:Math.max(1,container.clientWidth||500),height:Math.max(80,container.clientHeight||chartHeight())});
  }
}

let renderThermotankSetpoint;

function initThermotankSetpoint(){
  const range=document.querySelector('#setpoint-range');
  if(!range)return;
  const output=document.querySelector('#setpoint-value');
  const decrease=document.querySelector('#setpoint-decrease');
  const increase=document.querySelector('#setpoint-increase');
  const status=document.querySelector('#setpoint-status');
  const communication=document.querySelector('#thermotank-communication');
  let edited=false, sending=false, errorMessage='';

  function renderControls(){
    output.value=`${range.value} °C`;
    range.disabled=sending;
    decrease.disabled=sending||range.valueAsNumber<=Number(range.min);
    increase.disabled=sending||range.valueAsNumber>=Number(range.max);
  }

  function renderFeedback(snapshot){
    const requested=snapshot?.thermotank?.requested_c;
    const actual=snapshot?.thermotank?.actual_c;
    put('setpoint-requested',requested==null?'—':`${requested} °C`);
    put('setpoint-actual',actual==null?'—':`${actual} °C`);
    if(!edited&&requested!=null){
      range.value=requested;
      renderControls();
    }
    let message='Sin solicitud';
    if(requested!=null){
      message=requested===actual?'Confirmado':'Pendiente';
    }
    if(sending)message='Publicando…';
    if(errorMessage)message=errorMessage;
    status.toggleAttribute('data-error',Boolean(errorMessage));
    if(status.textContent!==message)status.textContent=message;
    const connection={
      waiting:'Esperando temperaturas',
      lost:'Comunicación perdida',
    }[snapshot?.thermotank?.communication]||'';
    if(communication.textContent!==connection)communication.textContent=connection;
  }

  async function publish(){
    const value=range.valueAsNumber;
    edited=true;
    sending=true;
    errorMessage='';
    renderControls();
    renderFeedback(lastSnapshot);
    try{
      await fetchJson('/api/termotanque/setpoint','No se pudo publicar el setpoint',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({value}),
      });
    }catch(error){
      errorMessage=error.message;
    }finally{
      sending=false;
      renderControls();
      renderFeedback(lastSnapshot);
    }
  }

  range.addEventListener('input',()=>{edited=true;renderControls()});
  range.addEventListener('change',publish);
  decrease.addEventListener('click',()=>{range.stepDown();publish()});
  increase.addEventListener('click',()=>{range.stepUp();publish()});
  renderControls();
  renderThermotankSetpoint=renderFeedback;
}

if(typeof document!=='undefined'){
  initThermotankSetpoint();
  initial();
  const stopConnection=connect();
  startEnergyRefresh();
  window.addEventListener('beforeunload',()=>{
    stopConnection();
    if(renderTimer!==null)clearTimeout(renderTimer);
    if(historyRefreshTimer)clearInterval(historyRefreshTimer);
    if(energyRefreshTimer)clearInterval(energyRefreshTimer);
    historyRefreshTimer=null;
    energyRefreshTimer=null;
  },{once:true});
}

if(typeof module!=='undefined')module.exports={batteryDetails,homeDayScale,known,lookup,number,valueText,batteryFlowState,gaugePercent,metricState,temperatureData,rollingDayRange,rollingDaySplits,temperatureChartOptions,FlowLogic,chartHeight,fetchJson,runGuarded,renderStationDetails};
