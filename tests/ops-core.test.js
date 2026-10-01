const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../ops-core.js');
test('freshness boundaries, missing timestamps and clock skew',()=>{
  assert.equal(C.status(null,9000),'unknown');assert.equal(C.status(0,5399),'live');
  assert.equal(C.status(0,5400),'stale');assert.equal(C.status(0,10800),'down');
  assert.equal(C.status(10000,9000),'live');
});
test('history rejects nonnumbers and filters exact time window',()=>{
  assert.deepEqual(C.series([[30,4],[10,0],[20,null],[22,NaN],[23,Infinity],[25,'5'],[40,6]],10,30),[[10,0],[30,4]]);
});
test('outage is a gap, not an interpolated line',()=>{
  assert.deepEqual(C.segments([[0,1],[3600,2],[10800,3],[14400,4]]),[[[0,1],[3600,2]],[[10800,3],[14400,4]]]);
});
test('extent and three-hour change use only real timestamped samples',()=>{
  const points=[[0,8],[3600,8],[7200,10],[10800,13],[14400,12]];
  assert.deepEqual(C.extent(points),[8,13]);
  assert.equal(C.change(points,10800,1800),4);
  assert.equal(C.change([[0,8],[14400,12]],10800,1800),null);
  assert.equal(C.extent([]),null);
});
test('wind rose bins wrapped directions and speed ranges without inventing samples',()=>{
  const b=C.windBins([[1,1,359],[2,3,1],[3,13,90],[4,null,180],['bad',2,null]]);
  assert.equal(b.total,3);assert.equal(b.max,2);
  assert.equal(b.sectors[0].counts[0],1);assert.equal(b.sectors[0].counts[1],1);
  assert.equal(b.sectors[4].counts[6],1);
});
test('compass covers all 16 directions including wrapped values',()=>{
  assert.equal(C.direction(90),'E');assert.equal(C.direction(180),'S');assert.equal(C.direction(270),'W');
  assert.equal(C.direction(-90),'W');assert.equal(C.direction(360),'N');assert.equal(C.direction(null),'—');
});
test('positions retain zero and reject invalid latitudes; uniform aspect ratio',()=>{
  const points=C.project([{id:'origin',lat:0,lon:0},{id:'north',lat:.001,lon:0},{id:'east',lat:0,lon:.001},{id:'absent'},{id:'invalid',lat:91,lon:1}]);
  assert.equal(points.length,3);const [o,n,e]=points;
  assert.ok(Math.abs((e.x-o.x)-(o.y-n.y))<.01);
  assert.equal(n.x,o.x);assert.equal(e.y,o.y);
  assert.deepEqual(C.project([]),[]);
});
test('single position is centered without inventing another node',()=>{
  const [p]=C.project([{id:'only',lat:37,lon:-8}]);assert.equal(p.x,300);assert.equal(p.y,140);
});
test('dateline neighbors remain nearby',()=>{
  const points=C.project([{lat:0,lon:179.999},{lat:0,lon:-179.999}]);assert.ok(Math.abs(points[0].x-points[1].x)<430);
});
test('reject incomplete service responses',()=>{
  assert.equal(C.validOverview({state:{},metrics:{},health:{lora:[null],meshtastic:[]},mesh:{nodes:[null]},server:{generated_at:1}}),false);
  assert.equal(C.validOverview({}),false);assert.equal(C.validOverview({state:[],metrics:{},health:{lora:[],meshtastic:[]},mesh:{nodes:[]},server:{generated_at:1}}),false);
  assert.equal(C.validOverview({state:{},metrics:{},health:{lora:[],meshtastic:[]},mesh:{nodes:[]},server:{generated_at:1}}),true);
});

// Regression: updating moisture used to recreate the temperature label as a placeholder.
const vm=require('node:vm'),fs=require('node:fs');
function soilGauge(){
  const source=fs.readFileSync(require('node:path').join(__dirname,'../b.html'),'utf8');
  const body=source.slice(source.indexOf('window.drawSoil=function'),source.indexOf('window.drawSoil(null,null)'));
  const svg={innerHTML:''};const context={window:{},document:{getElementById:()=>svg},I18N:{en:{soiltemp:'soil temperature'}},lang:'en'};
  vm.runInNewContext(body,context);return {draw:context.window.drawSoil,svg};
}
test('legacy soil gauge retains the real temperature when moisture changes',()=>{
  const {draw,svg}=soilGauge();draw(20.4,42);assert.match(svg.innerHTML,/>20\.4°<\/text>/);
  const before=svg.innerHTML;draw(20.4,65);assert.match(svg.innerHTML,/>20\.4°<\/text>/);assert.notEqual(svg.innerHTML,before);
});
test('legacy soil gauge never invents a temperature for missing readings',()=>{
  const {draw,svg}=soilGauge();draw(null,null);assert.match(svg.innerHTML,/Waiting for soil data/);assert.doesNotMatch(svg.innerHTML,/19\.6|47%/);
});
