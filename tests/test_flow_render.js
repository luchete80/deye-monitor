const assert=require('node:assert/strict');
const fs=require('node:fs');
const flow=require('../deye_monitor/static/app.js');

const html=fs.readFileSync('deye_monitor/static/index.html','utf8');
const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>`#${match[1]}`));

class Element{
  constructor(){this.className={baseVal:''};this.textContent='';this.attributes={}}
  setAttribute(name,value){this.attributes[name]=value}
  removeAttribute(name){delete this.attributes[name]}
}
const ids=['pv','grid','battery','load'].flatMap(id=>[`#flow-${id}`,`#flow-${id}-label`]);
for(const id of [...ids,'#pv-value','#grid-value','#battery-value','#load-value','#inverter-value','#flow-status','#diagram-description','#flow-description'])assert.ok(htmlIds.has(id),`Missing ${id} in index.html`);
assert.match(html,/viewBox="0 0 600 590"/);
const elements=Object.fromEntries([...ids,'#pv-value','#grid-value','#battery-value','#load-value','#inverter-value','#flow-status','#diagram-description','#flow-description'].map(id=>[id,new Element()]));
global.document={querySelector:selector=>elements[selector]};
const base={
  solar:{total_power_w:2800},grid:{power_w:720},battery:{power_w:420},load:{total_power_w:2400},inverter:{ac_power_w:3000},
  field_freshness:{solar:{total_power_w:true},grid:{power_w:true},battery:{power_w:true},load:{total_power_w:true}},
  connectivity:{broker:'connected',service:'online',logger:'online'},flow:{deadband_w:30,simulated:false},
};

flow.renderFlow(base);
assert.equal(elements['#flow-grid'].attributes['marker-end'],'url(#flow-arrow)');
assert.equal(elements['#flow-battery'].attributes['marker-start'],'url(#flow-arrow)');
assert.equal(elements['#flow-load-label'].textContent,'2.400 W');
assert.match(elements['#diagram-description'].textContent,/Grid → Inversor: 720 W/);

const idle=structuredClone(base);idle.grid.power_w=30;
flow.renderFlow(idle);
assert.equal(elements['#flow-grid'].className.baseVal,'flow-line idle');
assert.equal(elements['#flow-grid-label'].textContent,'30 W · —');
assert.equal(elements['#flow-grid'].attributes['marker-end'],undefined);
assert.doesNotMatch(elements['#diagram-description'].textContent,/Grid → Inversor: 30 W/);

const stale=structuredClone(base);stale.grid.power_w=-540;stale.field_freshness.grid.power_w=false;
flow.renderFlow(stale);
assert.equal(elements['#flow-grid'].className.baseVal,'flow-line stale');
assert.equal(elements['#flow-grid-label'].textContent,'540 W · ⚠');
assert.match(elements['#flow-description'].textContent,/última dirección Inversor → Grid/);

const offline=structuredClone(base);offline.connectivity.logger='offline';
flow.renderFlow(offline);
assert.equal(elements['#flow-grid'].className.baseVal,'flow-line offline');
assert.equal(elements['#flow-grid'].attributes['marker-end'],undefined);
assert.match(elements['#flow-description'].textContent,/dirección no confirmada/);
console.log('flow render ok');
