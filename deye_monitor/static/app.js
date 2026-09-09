const lookup=(state,path)=>path.split('.').reduce((v,k)=>v?.[k],state);
function render(state){
  document.querySelectorAll('[data-path]').forEach(el=>{const v=lookup(state,el.dataset.path);el.textContent=v===null||v===undefined?'Sin dato':`${Number(v).toLocaleString('es-AR',{maximumFractionDigits:2})} ${el.dataset.unit}`});
  const c=state.connectivity, label=`Broker: ${c.broker} · Servicio: ${c.service} · Logger: ${c.logger}`;
  const connection=document.querySelector('#connection'); connection.textContent=label; connection.className=c.stale?'stale':'';
  document.querySelector('#age').textContent=state.observed_at?`Actualizado: ${new Date(state.observed_at).toLocaleString('es-AR')}${c.stale?' (datos antiguos)':''}`:'Sin datos';
}
async function initial(){try{render(await (await fetch('/api/state')).json())}catch(_){document.querySelector('#connection').textContent='No se pudo obtener el estado'}}
function connect(){const source=new EventSource('/events');source.addEventListener('state',e=>render(JSON.parse(e.data)));source.onerror=()=>{document.querySelector('#connection').textContent='Reconectando actualizaciones…'}}
initial();connect();
