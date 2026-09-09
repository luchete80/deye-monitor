const lookup=(state,path)=>path.split('.').reduce((v,k)=>v?.[k],state);
const number=(value,unit='W')=>value===null||value===undefined?'Sin dato':`${Number(value).toLocaleString('es-AR',{maximumFractionDigits:2})} ${unit}`;
function relativeAge(timestamp){
  if(!timestamp)return 'Sin datos';
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/1000));
  if(seconds<60)return `hace ${seconds} s`;
  if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;
  if(seconds<86400)return `hace ${Math.floor(seconds/3600)} h`;
  return `hace ${Math.floor(seconds/86400)} d`;
}
function setFlow(id,value,direction,label,available){const line=document.querySelector(`#flow-${id}`),text=document.querySelector(`#flow-${id}-label`);line.classList.toggle('flow-active',available&&direction!==0);line.classList.toggle('flow-reverse',direction<0);line.removeAttribute('marker-start');line.removeAttribute('marker-end');if(available&&direction>0)line.setAttribute('marker-end','url(#flow-arrow)');if(available&&direction<0)line.setAttribute('marker-start','url(#flow-arrow)');text.textContent=available&&direction!==0?`${label} ${number(Math.abs(value))}`:'—'}
function renderFlow(state){const deadband=state.flow?.deadband_w??30,c=state.connectivity,offline=c.stale||c.broker==='disconnected'||c.service==='offline'||c.logger==='offline',value=path=>lookup(state,path),fresh=path=>lookup(state,`field_freshness.${path}`)===true&&!offline,pv=value('solar.total_power_w'),grid=value('grid.power_w'),battery=value('battery.power_w'),load=value('load.total_power_w');document.querySelector('#pv-value').textContent=number(pv);document.querySelector('#grid-value').textContent=number(grid);document.querySelector('#battery-value').textContent=number(battery);document.querySelector('#load-value').textContent=number(load);document.querySelector('#inverter-value').textContent=number(value('inverter.ac_power_w'));setFlow('pv',pv,pv>deadband?1:0,'PV → Inversor',fresh('solar.total_power_w'));setFlow('grid',grid,grid>deadband?1:grid<-deadband?-1:0,grid>deadband?'Grid → Inversor':'Inversor → Grid',fresh('grid.power_w'));setFlow('battery',battery,battery<-deadband?1:battery>deadband?-1:0,battery<-deadband?'Batería → Inversor':'Inversor → Batería',fresh('battery.power_w'));setFlow('load',load,load>deadband?1:0,'Inversor → UPS + Load',fresh('load.total_power_w'));document.querySelector('#flow-status').textContent=offline?'Flujo detenido: datos antiguos o equipo sin conexión.':`Zona muerta: ±${number(deadband)}.`}
function render(state){
  document.querySelectorAll('[data-path]').forEach(el=>el.textContent=number(lookup(state,el.dataset.path),el.dataset.unit));
  const c=state.connectivity, label=`Broker: ${c.broker} · Servicio: ${c.service} · Logger: ${c.logger}`;
  const connection=document.querySelector('#connection'); connection.textContent=label; connection.className=c.stale?'stale':'';
  document.querySelector('#age').textContent=`Última métrica: ${relativeAge(state.data_observed_at)}${c.stale?' (datos antiguos)':''}`;
  renderFlow(state);
}
async function initial(){try{render(await (await fetch('/api/state')).json())}catch(_){document.querySelector('#connection').textContent='No se pudo obtener el estado'}}
function connect(){const source=new EventSource('/events');source.addEventListener('state',e=>render(JSON.parse(e.data)));source.onerror=()=>{document.querySelector('#connection').textContent='Reconectando actualizaciones…'}}
initial();connect();
