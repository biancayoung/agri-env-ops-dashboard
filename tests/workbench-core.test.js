const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../ops-core.js');

test('time-only field history never becomes a fabricated dated trend',()=>{
  const f={latest:5,history:[['23:59:59',4],['00:00:01',5]]};
  assert.deepEqual(C.fieldSeries('one','humidity',f,{}, {},[]),[]);
  assert.equal(C.fieldReceipt('one','humidity',f,{},[]),null);
});
test('dated history is isolated by both source and field',()=>{
  const overview={metrics:{a:{source:'one',field:'humidity'},b:{source:'two',field:'humidity'},c:{source:'one',field:'co2'}}};
  const points=C.fieldSeries('one','humidity',{history:[]},overview,{a:[[100,3],[700,4]],b:[[500,99]],c:[[600,900]]},[
    {dev_eui:'two',received_at:800,decoded:{humidity:99}},
    {dev_eui:'one',received_at:760,decoded:{humidity:5}}
  ]);
  assert.deepEqual(points,[[100,3],[700,4],[760,5]]);
  assert.equal(points[1][0]-points[0][0],10*(points[2][0]-points[1][0]));
});
test('receipt age belongs to the field, never substituted from device health',()=>{
  const overview={state:{a:3},metrics:{a:{source:'one',field:'humidity',last_received:100}},health:{lora:[{id:'one',last_seen:900}]}};
  assert.equal(C.fieldReceipt('one','humidity',{latest:3},overview,[]),100);
  assert.equal(C.fieldReceipt('one','co2',{latest:5},overview,[]),null);
  assert.equal(C.fieldReceipt('one','humidity',{latest:4},overview,[[100,3]]),null);
});
test('zero values and dated raw uplinks remain valid, unknown units remain unknown',()=>{
  const f={latest:0,history:[]};
  const points=C.fieldSeries('one','probe ch2',f,{}, {},[{dev_eui:'one',received_at:100,decoded:{'probe ch2':0}}]);
  assert.deepEqual(points,[[100,0]]);
  assert.equal(C.fieldReceipt('one','probe ch2',f,{},points),100);
  assert.equal(C.fieldUnits['probe ch2'],undefined);
  assert.equal(C.fieldUnits.constructor,undefined);
  assert.equal(C.fieldUnits['barometric pressure'],'Pa');
});
test('malformed fields response rejected without rejecting an empty response',()=>{
  assert.equal(C.validFields({}),true);
  assert.equal(C.validFields({one:{fields:{humidity:{latest:0,history:[]}}}}),true);
  for(const bad of [null,[],{one:null},{one:{fields:[]}}, {one:{fields:{humidity:{latest:'4',history:[]}}}}])assert.equal(C.validFields(bad),false);
});

test('mapped DB history and raw copy of the same uplink are not counted twice',()=>{
  const overview={metrics:{a:{source:'one',field:'humidity'}}};
  const points=C.fieldSeries('one','humidity',{history:[[100,3],[200,4]]},overview,{a:[[100.001,3]]},[
    {dev_eui:'one',received_at:100,decoded:{humidity:3}},
    {dev_eui:'one',received_at:200,decoded:{humidity:4}}
  ]);
  assert.deepEqual(points,[[100.001,3],[200,4]]);
});
