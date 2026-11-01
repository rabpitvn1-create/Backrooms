'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
vm.runInThisContext(fs.readFileSync('pages/regex.js','utf8'));
const core=require('../engine/target/javascript/game-core.js');
Object.assign(globalThis,core);
globalThis.window=globalThis;
globalThis.document={documentElement:{dataset:{}}};
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.BACKROOMS_ASSETS={};
for(const dir of ['knowledge','canon'])
  for(const name of fs.readdirSync('web/'+dir))
    if(/\.(json|md)$/.test(name))BACKROOMS_ASSETS[dir+'/'+name]=fs.readFileSync('web/'+dir+'/'+name,'utf8');
for(const name of ['knowledge_db.json','level_0_canon_cards.json','level_1plus_canon_cards.json'])
  BACKROOMS_ASSETS['knowledge/'+name]=fs.readFileSync('Legacy/knowledge/'+name,'utf8');
globalThis.BACKROOMS_CONFIG={models:['fixture']};
vm.runInThisContext(fs.readFileSync('pages/bridge.js','utf8'));
const html=fs.readFileSync('web/index.html','utf8');
const initial=vm.runInNewContext(html.slice(html.indexOf('const prologue'),html.indexOf('const byId'))+'; initial');
let state, errors=[],prompt='',delta=null,reply='Cao Minh quan sát hành lang trước mặt.';
globalThis.backroomTurn=raw=>{state=JSON.parse(raw)};
globalThis.backroomError=e=>errors.push(String(e));
globalThis.backroomProvider=()=>{};
globalThis.fetch=async(_,options)=>{
  prompt=JSON.parse(options.body).contents[0].parts[0].text;
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({
    itemUseRequest:null,reply,entityPreview:'',narrativeDelta:delta
  })}]}}]}),{status:200});
};
const snapshot=()=>JSON.parse(Android.levelCoreSnapshot());
async function turn(action){
  await Android.submitGameplayAction(JSON.stringify(state),'EXECUTE',action);
  await __webGame.idle;
}
function fresh(){
  state=JSON.parse(Android.initializeLevelGame(JSON.stringify(initial),true));
  errors=[];delta=null;reply='Cao Minh quan sát hành lang trước mặt.';
}
(async()=>{
  const random=Math.random;Math.random=()=>0.61;
  try{
    fresh();
    assert.equal(state.levelTravel.nodeId,'LEVEL.NODE.0','New Game must start at Level 0');
    const itemsBefore=JSON.stringify(snapshot().inventories);
    delta={summary:'Cao Minh dùng Hồi Hoàn Đan tự sáng tác để cứu người phụ nữ.'};
    reply='Người phụ nữ tỉnh dậy, người chồng òa khóc vì vui mừng.';
    await turn('Cao Minh dùng một viên Hồi Hoàn Đan do hắn tự tạo để cứu người phụ nữ.');
    assert.deepEqual(errors,[],'Non-ID narrative items must be allowed');
    assert.match(prompt,/NARRATIVE SCENE RULES/);
    assert.match(prompt,/ITEM_DIRECTORY/);
    assert.equal(JSON.stringify(snapshot().inventories),itemsBefore,'Non-ID cannot create Core inventory');
    assert.ok(state.flags.narrativeScene,'Narrative memory must be saved in flags');
    assert.match(state.flags.narrativeScene.facts[0],/Hồi Hoàn Đan/);
    assert.equal(state.flags.narrativeScene.visit.includes('LEVEL.NODE.0'),true);
    console.log('PASS: player-created Non-ID item only changes bounded narrative memory');

    delta=null;reply='Cao Minh nhớ người phụ nữ hắn vừa cứu.';
    await turn('Cao Minh hồi tưởng về người phụ nữ vừa được cứu.');
    assert.deepEqual(errors,[]);
    assert.ok(prompt.includes('Hồi Hoàn Đan'),'Current Level must remember previous scene');
    console.log('PASS: scene memory returns to GM in same Level');

    const stored=snapshot(),ui=JSON.stringify(state);
    core.coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'],JSON.stringify(stored));
    state=JSON.parse(__webGame.call('resumeLevelGame',ui,'true'));
    assert.ok(state.flags.narrativeScene);
    console.log('PASS: save/load preserves visit-scoped narrative memory');

    fresh();const before=snapshot(),originalTurn=state.turn;
    delta={summary:'Invented encounter',actors:[{name:'Người lạ',emotion:'sợ hãi'}]};
    await turn('Cao Minh quan sát bức tường.');
    assert.ok(errors.some(e=>e.includes('narrative_unconfirmed_encounter')),errors.join(';'));
    assert.deepEqual(snapshot(),before,'Rejected narrative delta must roll back Core');
    assert.equal(state.turn,originalTurn);
    console.log('PASS: GM cannot invent One-Time NPC without a Core encounter roll');

    fresh();
    delta={relationships:[{from:'cao-minh',to:'luc-tram',emotion:'bất an'}]};
    await turn('Cao Minh suy nghĩ về Lục Trầm.');
    assert.deepEqual(errors,[]);
    assert.equal(state.flags.narrativeRelations['cao-minh>luc-tram'],'bất an');
    assert.equal(state.flags.narrativeRelations['luc-tram>cao-minh'],undefined);
    console.log('PASS: emotional relationships are directional, not automatically reciprocal');
  }finally{Math.random=random}
})().catch(e=>{console.error(e);process.exitCode=1});
