const lookup=(state,path)=>path.split('.').reduce((v,k)=>v?.[k],state);
function relativeAge(timestamp){
  if(!timestamp)return 'Sin datos';
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/1000));
  if(seconds<60)return `hace ${seconds} s`;
  if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;
  if(seconds<86400)return `hace ${Math.floor(seconds/3600)} h`;
  return `hace ${Math.floor(seconds/86400)} d`;
}
function render(state){
  document.querySelectorAll('[data-path]').forEach(el=>{const v=lookup(state,el.dataset.path);el.textContent=v===null||v===undefined?'Sin dato':`${Number(v).toLocaleString('es-AR',{maximumFractionDigits:2})} ${el.dataset.unit}`});
  const c=state.connectivity, label=`Broker: ${c.broker} · Servicio: ${c.service} · Logger: ${c.logger}`;
  const connection=document.querySelector('#connection'); connection.textContent=label; connection.className=c.stale?'stale':'';
  document.querySelector('#age').textContent=`Última métrica: ${relativeAge(state.data_observed_at)}${c.stale?' (datos antiguos)':''}`;
}
async function initial(){try{render(await (await fetch('/api/state')).json())}catch(_){document.querySelector('#connection').textContent='No se pudo obtener el estado'}}
function connect(){const source=new EventSource('/events');source.addEventListener('state',e=>render(JSON.parse(e.data)));source.onerror=()=>{document.querySelector('#connection').textContent='Reconectando actualizaciones…'}}
initial();connect();
