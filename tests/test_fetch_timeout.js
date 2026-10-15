const assert=require('node:assert/strict');
const {fetchJson,runGuarded}=require('../deye_monitor/static/app.js');

(async()=>{
  const originalFetch=global.fetch,originalSetTimeout=global.setTimeout,originalClearTimeout=global.clearTimeout;
  let attempt=0,timerCount=0,busy=false;
  global.setTimeout=(callback)=>{timerCount++;if(timerCount===1)callback();return timerCount};
  global.clearTimeout=()=>{};
  global.fetch=async(_url,{signal})=>{
    attempt++;
    if(attempt===1){
      if(signal.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
      await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}),{once:true})));
    }
    return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};
  };
  try{
    await assert.rejects(
      runGuarded(()=>busy,value=>{busy=value},()=>fetchJson('/api/history','Historial')),
      /tiempo de espera agotado/,
    );
    assert.equal(busy,false,'in-flight guard clears after timeout');
    assert.deepEqual(
      await runGuarded(()=>busy,value=>{busy=value},()=>fetchJson('/api/history','Historial')),
      {ok:true},
    );
    assert.equal(attempt,2,'a later request is allowed after timeout');
    assert.equal(busy,false,'in-flight guard clears after retry');
  }finally{
    global.fetch=originalFetch;global.setTimeout=originalSetTimeout;global.clearTimeout=originalClearTimeout;
  }
  console.log('fetch timeout recovery ok');
})().catch(error=>{console.error(error);process.exitCode=1});
