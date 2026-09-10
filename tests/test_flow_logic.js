const assert=require('node:assert/strict');
const dashboard=require('../deye_monitor/static/app.js');

assert.equal(dashboard.positivePower(720),720);
assert.equal(dashboard.positivePower(-540),0);
assert.equal(dashboard.positivePower(0),0);
assert.equal(dashboard.positivePower(null),null);
assert.equal(dashboard.positivePower(undefined),null);
assert.equal(dashboard.batteryFlowState(250),'charging');
assert.equal(dashboard.batteryFlowState(-250),'discharging');
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
assert.equal(dashboard.FlowLogic.pathDirection('battery',1),-1);
assert.equal(dashboard.FlowLogic.pathDirection('load',1),-1);
assert.deepEqual(dashboard.FlowLogic.state('load',100,30,false,online,false),{status:'stale',direction:0});
assert.equal(dashboard.plotHeight(),144);
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

const data=dashboard.historyData([
  {captured_at:'2026-01-01T00:00:00Z',pv_power_w:100,grid_power_w:-40,battery_power_w:-20,home_power_w:80},
  {captured_at:'2026-01-01T00:00:20Z',pv_power_w:200,grid_power_w:50,battery_power_w:30,home_power_w:90},
]);
assert.deepEqual(data[1],[100,null,200]);
assert.deepEqual(data[2],[0,null,50]);
assert.deepEqual(data[3],[0,null,30]);
assert.deepEqual(data[4],[80,null,90]);

const fiveMinuteData=dashboard.historyData([
  {captured_at:'2026-01-01T00:00:00Z',pv_power_w:100,grid_power_w:10,battery_power_w:20,home_power_w:80},
  {captured_at:'2026-01-01T00:05:00Z',pv_power_w:200,grid_power_w:20,battery_power_w:30,home_power_w:90},
  {captured_at:'2026-01-01T00:10:00Z',pv_power_w:300,grid_power_w:30,battery_power_w:40,home_power_w:100},
]);
assert.deepEqual(fiveMinuteData[1],[100,200,300]);

const fiveMinuteGap=dashboard.historyData([
  {captured_at:'2026-01-01T00:00:00Z',pv_power_w:100,grid_power_w:10,battery_power_w:20,home_power_w:80},
  {captured_at:'2026-01-01T00:05:00Z',pv_power_w:200,grid_power_w:20,battery_power_w:30,home_power_w:90},
  {captured_at:'2026-01-01T00:15:00Z',pv_power_w:300,grid_power_w:30,battery_power_w:40,home_power_w:100},
]);
assert.deepEqual(fiveMinuteGap[1],[100,200,null,300]);
assert.equal(dashboard.chartOptions('x',500,300).axes[2].scale,'battery');
console.log('dashboard logic ok');
