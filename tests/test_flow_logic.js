const assert=require('node:assert/strict');
const dashboard=require('../deye_monitor/static/app.js');

assert.equal(dashboard.batteryFlowState(250),'discharging');
assert.equal(dashboard.batteryFlowState(-250),'charging');
assert.equal(dashboard.batteryFlowState(0),'idle');
assert.equal(dashboard.batteryFlowState(null),'unknown');
assert.equal(dashboard.gaugePercent(0,6000),0);
assert.equal(dashboard.gaugePercent(3000,6000),50);
assert.equal(dashboard.gaugePercent(9000,6000),100);
assert.equal(dashboard.gaugePercent(73,100),73);
assert.equal(dashboard.gaugePercent(-3000,6000),0);
assert.equal(dashboard.gaugePercent(-3000,6000,true),50);
assert.equal(dashboard.gaugePercent(null,6000),null);
assert.equal(dashboard.gaugePercent(100,0),null);

const online={broker:'connected',service:'online',logger:'online'};
assert.deepEqual(dashboard.FlowLogic.state('grid',720,30,true,online,false),{status:'active',direction:1});
assert.deepEqual(dashboard.FlowLogic.state('grid',-540,30,true,online,false),{status:'active',direction:-1});
assert.deepEqual(dashboard.FlowLogic.state('battery',30,30,true,online,false),{status:'idle',direction:0});
assert.equal(dashboard.FlowLogic.pathDirection('battery',1),1);
assert.equal(dashboard.FlowLogic.pathDirection('load',1),-1);
assert.deepEqual(dashboard.FlowLogic.state('load',100,30,false,online,false),{status:'stale',direction:0});
const branch=(status,direction=0)=>({status,direction});
const enter=dashboard.FlowLogic.transition('pv',120,100,true,online,false,null);
assert.deepEqual(enter,{status:'active',direction:1});
assert.deepEqual(dashboard.FlowLogic.transition('pv',60,100,true,online,false,enter),{status:'active',direction:1});
assert.deepEqual(dashboard.FlowLogic.transition('pv',49,100,true,online,false,enter),{status:'idle',direction:0});
assert.deepEqual(dashboard.FlowLogic.transition('grid',-120,100,true,online,false,branch('active',1)),{status:'active',direction:-1});
assert.deepEqual(dashboard.FlowLogic.transition('grid',80,100,false,online,false,branch('active',1)),{status:'stale',direction:0});
const sameSide=dashboard.FlowLogic.bridge({pv:branch('active',1),grid:branch('idle'),battery:branch('unknown'),load:branch('idle')},{pv:1000,grid:0,battery:0,load:0},100);
assert.equal(sameSide.active,false,'upper flow alone must not activate trunk');
const solarHome=dashboard.FlowLogic.bridge({pv:branch('active',1),grid:branch('stale'),battery:branch('unknown'),load:branch('active',1)},{pv:900,grid:0,battery:0,load:650},100);
assert.deepEqual({active:solarHome.active,direction:solarHome.direction},{active:true,direction:1},'fresh PV and Casa can bridge without idle grid/battery sensors');
const upwardExport=dashboard.FlowLogic.bridge({pv:branch('idle'),grid:branch('active',-1),battery:branch('active',1),load:branch('idle')},{pv:0,grid:-700,battery:500,load:0},100);
assert.deepEqual({active:upwardExport.active,direction:upwardExport.direction},{active:true,direction:-1},'grid export and battery discharge bridge upward');
const balanced=dashboard.FlowLogic.bridge({pv:branch('active',1),grid:branch('idle'),battery:branch('idle'),load:branch('active',1)},{pv:900,grid:0,battery:0,load:60},100,1);
assert.equal(balanced.active,true,'trunk holds above half threshold while supporting flows remain active');
const noisyOff=dashboard.FlowLogic.bridge({pv:branch('active',1),grid:branch('idle'),battery:branch('idle'),load:branch('active',1)},{pv:900,grid:0,battery:0,load:49},100,1);
assert.equal(noisyOff.active,false,'trunk exits at half threshold');
const reversed=dashboard.FlowLogic.bridge({pv:branch('idle'),grid:branch('active',-1),battery:branch('active',1),load:branch('idle')},{pv:0,grid:-700,battery:500,load:0},100,1);
assert.deepEqual({active:reversed.active,direction:reversed.direction},{active:true,direction:-1},'strong opposite bridge direction can enter immediately');
assert.equal(dashboard.chartHeight(600),140);
assert.equal(dashboard.chartHeight(768),140);
assert.equal(dashboard.chartHeight(900),300);
const snapshot={
  solar:{total_power_w:2800},grid:{power_w:720},battery:{power_w:-300},load:{total_power_w:1900},
  field_freshness:{solar:{total_power_w:true},grid:{power_w:true},battery:{power_w:true},load:{total_power_w:true}},
  connectivity:online,
};
assert.equal(dashboard.metricState(snapshot,'solar','total_power_w'),'online');
assert.equal(dashboard.metricState(snapshot,'grid','power_w'),'online');
assert.equal(dashboard.metricState({...snapshot,flow:{simulated:true},connectivity:{...online,broker:'disconnected'}},'grid','power_w'),'online');
assert.equal(dashboard.metricState({...snapshot,connectivity:{...online,logger:'offline'}},'grid','power_w'),'offline');
assert.equal(dashboard.metricState({...snapshot,field_freshness:{...snapshot.field_freshness,grid:{power_w:false}}},'grid','power_w'),'stale');
assert.equal(dashboard.metricState({...snapshot,grid:{power_w:null}},'grid','power_w'),'unknown');

const window24=dashboard.temperatureChartOptions('x',500,300).scales.x.range();
assert.equal(window24[1]-window24[0],86400);
const cfg={soc_min:25,soc_max:95,battery_usable_kwh:7,home_day_scale_kwh:6,home_day_scale_next_kwh:12};
for(const soc of [24,25,26,94,95,96])for(const power of [-1000,0,1000]){
 const state={battery:{soc_pct:soc,power_w:power},field_freshness:{battery:{soc_pct:true,power_w:true}},connectivity:online};
 const detail=dashboard.batteryDetails(state,cfg,power);
 assert.equal(detail.alert,(soc<=25&&power>=0)||(soc>=95&&power<0));
 assert.equal(dashboard.batteryDetails({...state,field_freshness:{}},cfg,power).alert,false);
}
const middle={battery:{soc_pct:60,power_w:1000},field_freshness:{battery:{soc_pct:true,power_w:true}},connectivity:online};
assert.equal(dashboard.batteryDetails(middle,cfg).available,3.5);
assert.equal(dashboard.batteryDetails(middle,cfg).fraction,0.5);
assert.equal(dashboard.homeDayScale(6,cfg),6);
assert.equal(dashboard.homeDayScale(6.1,cfg),12);
assert.equal(dashboard.homeDayScale(13,cfg),18);
assert.equal(dashboard.temperatureChartOptions('',500,300).series[1].spanGaps,false);
console.log('dashboard logic ok');
