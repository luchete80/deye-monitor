const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(require.resolve('../deye_monitor/static/solar.js'),'utf8');

async function run(samples,missingPlot=false){
  const status={textContent:''},container={clientWidth:800,clientHeight:360};
  const charts=[];
  class Plot{
    constructor(options,data,target){this.options=options;this.data=data;this.target=target;charts.push(this)}
    setData(data){this.data=data}
    setSize(size){this.size=size}
  }
  const context={
    document:{querySelector:selector=>selector==='#solar-history-status'?status:container},
    window:{addEventListener(){}},uPlot:Plot,
    fetch:async()=>({headers:{get:()=> 'application/json'},ok:true,json:async()=>({samples})}),
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    AbortController,
  };
  if(missingPlot)delete context.uPlot;
  vm.runInNewContext(source,context,{filename:'solar.js'});
  await new Promise(resolve=>setImmediate(resolve));
  return{status,charts};
}

(async()=>{
  const empty=await run([]);
  assert.equal(empty.status.textContent,'Sin historial solar en las últimas 24 h.');
  assert.equal(empty.charts.length,0);

  const populated=await run([{captured_at:'2026-10-15T12:00:00Z',pv_power_w:250}]);
  assert.equal(populated.status.textContent,'');
  assert.equal(populated.charts.length,1);
  assert.deepEqual(Array.from(populated.charts[0].data[1]),[250]);
  const missing=await run([{captured_at:'2026-10-15T12:00:00Z',pv_power_w:250}],true);
  assert.match(missing.status.textContent,/No se pudo cargar el gráfico solar/);
  console.log('solar chart runtime ok');
})().catch(error=>{console.error(error);process.exitCode=1});
