const assert=require('node:assert/strict');
const flow=require('../deye_monitor/static/app.js');

const online={broker:'connected',service:'online',logger:'online'};

assert.equal(flow.direction('grid',720,30),1);
assert.equal(flow.direction('grid',-540,30),-1);
assert.equal(flow.direction('battery',420,30),1);
assert.equal(flow.direction('battery',-300,30),-1);
assert.equal(flow.pathDirection('battery',1),-1);
assert.equal(flow.pathDirection('battery',-1),1);
assert.equal(flow.direction('pv',2800,30),1);
assert.equal(flow.direction('load',1900,30),1);
assert.equal(flow.direction('grid',30,30),0);
assert.equal(flow.direction('battery',-30,30),0);
assert.deepEqual(flow.state('grid',720,30,true,online,false),{status:'active',direction:1});
assert.deepEqual(flow.state('grid',20,30,true,online,false),{status:'idle',direction:0});
assert.deepEqual(flow.state('grid',720,30,false,online,false),{status:'stale',direction:0});
assert.deepEqual(flow.state('grid',720,30,true,{...online,logger:'offline'},false),{status:'offline',direction:0});
assert.equal(flow.offline({broker:'disconnected',service:'online',logger:'online'},true),false);
assert.equal(flow.offline({broker:'disconnected',service:'online',logger:'online'},false),true);
console.log('flow logic ok');
