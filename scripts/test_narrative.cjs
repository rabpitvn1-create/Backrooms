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
    const itemsBefore=structuredClone(snapshot().inventories);
    delta={summary:'Cao Minh dùng Hồi Hoàn Đan tự sáng tác để cứu người phụ nữ.'};
    reply='Người phụ nữ tỉnh dậy, người chồng òa khóc vì vui mừng.';
    await turn('Cao Minh dùng một viên Hồi Hoàn Đan do hắn tự tạo để cứu người phụ nữ.');
    assert.deepEqual(errors,[],'Non-ID narrative items must be allowed');
    assert.match(prompt,/NARRATIVE SCENE RULES/);
    assert.match(prompt,/ITEM_DIRECTORY/);
    assert.deepEqual(snapshot().inventories,itemsBefore,'Non-ID cannot create Core inventory');
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

    // A synthetic survivor ticket tests the Core-locked path without changing RNG policy.
    fresh();
    const lockedAction='Khám phá', encounterBefore=JSON.stringify(state);
    core.coreItemUseBegin(encounterBefore,lockedAction);
    const requestedRolls={meta:false,turn:state.turn,survivor:{success:true},entityEncounter:{success:false}};
    const prepared=JSON.parse(__webGame.call('prepareNamedFollowerTurn',encounterBefore,lockedAction,JSON.stringify(requestedRolls),'EXPLORE'));
    assert.ok(prepared.state&&prepared.rolls,'prepareNamedFollowerTurn must return a plan');
    const encounterReply={
      itemUseRequest:null,reply:'Người chồng nắm tay người vợ, cả hai vừa thoát chết.',
      entityPreview:'',narrativeDelta:{
        summary:'Đôi vợ chồng vô danh được Cao Minh cứu sống.',
        actors:[{name:'Người vợ',emotion:'biết ơn',belief:'Mình đã được cứu',intent:'ở cạnh chồng'},
                {name:'Người chồng',emotion:'vui mừng',belief:'Vợ đã an toàn',intent:'bảo vệ vợ'}]
      }
    };
    const committed=JSON.parse(core.coreCandidate(JSON.stringify(prepared.state),JSON.stringify(encounterReply),JSON.stringify(prepared.rolls),lockedAction));
    assert.ok(!committed.bridgeError,committed.bridgeError);
    core.coreItemUseComplete();
    state=committed;
    assert.equal(state.flags.narrativeScene.actors.length,2);
    assert.equal(state.flags.narrativeScene.actors[0].emotion,'biết ơn');
    assert.equal(state.flags.narrativeScene.actors[1].emotion,'vui mừng');
    assert.equal(state.party.some(x=>x.name==='Người vợ'),false,'one-time encounter cannot become Party member');
    assert.equal(Boolean(state.flags.survivorRegistry&&JSON.stringify(state.flags.survivorRegistry).includes('Người vợ')),false);
    console.log('PASS: Core-approved One-Time encounter maintains independent NPC emotions');
    const originalNpc=state.flags.narrativeScene.actors[0].name;
    const memoryVisit=state.flags.narrativeScene.visit;
    const closed=structuredClone(state);
    closed.flags.narrativeScene.closed=true;
    const lateEncounter=structuredClone(closed);
    lateEncounter.flags.narrativeLevelMemory=closed.flags.narrativeLevelMemory;
    core.coreItemUseBegin(JSON.stringify(lateEncounter),'Khám phá');
    const repeated=JSON.parse(core.coreCandidate(JSON.stringify(lateEncounter),
      JSON.stringify({itemUseRequest:null,reply:'Người vợ quay lại.',entityPreview:'',
        narrativeDelta:{summary:'Một cuộc gặp lại không hợp lệ.',actors:[{name:originalNpc,emotion:'vui mừng'}]}}),
      JSON.stringify({survivor:{success:true},entityEncounter:{success:false}}),'Khám phá'));
    core.coreItemUseCancel();
    assert.ok(repeated.bridgeError&&repeated.bridgeError.includes('narrative_npc_reappeared'),
      'One-Time identity must not be permitted to repeat after closing');
    assert.equal(state.flags.narrativeLevelMemory.visit,memoryVisit);
    console.log('PASS: repeated NPC identity is rejected and per-Level memory survives a closed scene');
    const scopedMarker='Đôi vợ chồng vô danh được Cao Minh cứu sống.';
    let next=state;
    Math.random=()=>0;
    const firstNode=next.levelTravel.nodeId;
    for(let i=0;i<3;i++){
      const previous=JSON.stringify(next);
      const nextCandidate=JSON.stringify({...next,turn:next.turn+1});
      next=JSON.parse(__webGame.call('finishLevelTurn',previous,nextCandidate,'Khám phá'));
      assert.ok(!next.bridgeError,next.bridgeError);
    }
    core.coreItemUseBegin(JSON.stringify(next),'Khám phá');
    const finalCandidate=JSON.parse(core.coreCandidate(JSON.stringify(next),
      JSON.stringify({itemUseRequest:null,reply:'Cao Minh bước qua bức tường chập chờn.',entityPreview:'',narrativeDelta:null}),
      JSON.stringify({survivor:{success:false},entityEncounter:{success:false}}),'Khám phá'));
    assert.ok(!finalCandidate.bridgeError,finalCandidate.bridgeError);
    core.coreItemUseComplete();
    next=finalCandidate;
    assert.notEqual(next.levelTravel.nodeId,firstNode,'four Core-accepted trials should no-clip');
    assert.equal(next.levelTravel.exitStreak,0);
    const afterTravelPrompt=core.corePrompt(JSON.stringify(next),'Cao Minh suy nghĩ',JSON.stringify({meta:false,turn:next.turn}));
    assert.ok(!afterTravelPrompt.includes(scopedMarker),'one-time memory cannot reach GM after no-clip');
    const persistedTravel=JSON.parse(Android.levelCoreSnapshot());
    const persistedFlags=JSON.parse(persistedTravel.world.flagsJson);
    const persistedUi=JSON.parse(persistedTravel.world.levelTravelUi);
    assert.equal(persistedFlags.narrativeScene,undefined,'Core save must not retain expired NPC scene');
    assert.equal(persistedFlags.narrativeLevelMemory,undefined,'Core save must not retain expired Level facts');
    assert.equal(persistedUi.flags.narrativeScene,undefined,'saved UI projection must forget NPC scene');
    assert.ok((persistedFlags.narrativeSeen||[]).includes('người vợ'),'NPC identity marker survives without retaining biography');
    console.log('PASS: authoritative Core snapshot no longer stores expired scene and Level memory');
    console.log('PASS: One-Time NPC memory expires when leaving the Level');
    Math.random=()=>0.61;

    fresh();
    delta={relationships:[{from:'cao-minh',to:'luc-tram',emotion:'bất an'}]};
    await turn('Cao Minh suy nghĩ về Lục Trầm.');
    assert.deepEqual(errors,[]);
    assert.equal(state.flags.narrativeRelations['cao-minh>luc-tram'],'bất an');
    assert.equal(state.flags.narrativeRelations['luc-tram>cao-minh'],undefined);
    console.log('PASS: emotional relationships are directional, not automatically reciprocal');
  }finally{Math.random=random}
})().catch(e=>{console.error(e);process.exitCode=1});
