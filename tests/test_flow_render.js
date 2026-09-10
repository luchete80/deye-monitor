const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('deye_monitor/static/index.html','utf8');
const script=fs.readFileSync('deye_monitor/static/app.js','utf8');
const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>`#${match[1]}`));

for(const id of ['#solar-value','#grid-value','#battery-value','#load-value','#solar-status','#grid-status','#battery-status','#load-status','#power-chart','#history-status','#connection','#age'])assert.ok(htmlIds.has(id),`Missing ${id}`);
for(const label of ['Paneles','Grid','Batería','UPS / Casa','Últimas 24 horas'])assert.match(html,new RegExp(label));
assert.doesNotMatch(html,/Inversor|inverter-value|energy-diagram|history-range|soc-chart/);
assert.match(html,/uPlot\.iife\.min\.js/);
assert.match(script,/range=24h/);
assert.match(script,/scale:'battery'/);
assert.match(script,/positivePower/);
assert.match(script,/ResizeObserver/);
console.log('dashboard render assets ok');
