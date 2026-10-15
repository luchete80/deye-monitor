const assert=require('node:assert/strict');
const {solarHistoryData}=require('../deye_monitor/static/solar.js');

const data=solarHistoryData([
  {captured_at:'2026-01-01T00:00:00Z',pv_power_w:100,grid_power_w:10,battery_power_w:20,home_power_w:80,soc_pct:50},
  {captured_at:'2026-01-01T00:05:00Z',pv_power_w:200,grid_power_w:10,battery_power_w:20,home_power_w:80,soc_pct:50},
  {captured_at:'2026-01-01T00:35:00Z',pv_power_w:300,grid_power_w:10,battery_power_w:20,home_power_w:80,soc_pct:50},
]);
assert.equal(data[0].length,data[1].length);
assert.deepEqual(data[0],[1767225600,1767225900,1767226200,1767227700]);
assert.deepEqual(data[1],[100,200,null,300]);

const zero=solarHistoryData([
  {captured_at:'2026-01-01T00:00:00Z',pv_power_w:0,grid_power_w:0,battery_power_w:0,home_power_w:0,soc_pct:0},
]);
assert.deepEqual(zero[1],[null]);
console.log('solar history chart data ok');
