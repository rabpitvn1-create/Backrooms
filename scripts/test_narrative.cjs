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
let state, errors=[],prompt='',delta=null,proposedFlags={},reply='Cao Minh quan sát hành lang trước mặt.';
globalThis.backroomTurn=raw=>{state=JSON.parse(raw)};
globalThis.backroomError=e=>errors.push(String(e));
globalThis.backroomProvider=()=>{};
globalThis.fetch=async(_,options)=>{
  prompt=JSON.parse(options.body).contents[0].parts[0].text;
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({
    itemUseRequest:null,reply,entityPreview:'',narrativeDelta:delta,flags:proposedFlags
  })}]}}]}),{status:200});
};
const snapshot=()=>JSON.parse(Android.levelCoreSnapshot());
async function turn(action){
  await Android.submitGameplayAction(JSON.stringify(state),'EXECUTE',action);
  await __webGame.idle;
}
function fresh(){
  state=JSON.parse(Android.initializeLevelGame(JSON.stringify(initial),true));
  errors=[];delta=null;proposedFlags={};reply='Cao Minh quan sát hành lang trước mặt.';
}
const watchdog=setTimeout(()=>{console.error('Narrative checks did not complete');process.exit(1);},30000);
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
    assert.ok(!prompt.includes('"narrativeSeen"'),'Opaque NPC identifiers must not leak into prompt');
    assert.ok(!prompt.includes('coreSnapshot'),'Nested Core snapshots must not leak into canon builders');

    const stored=snapshot(),ui=JSON.stringify(state);
    core.coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'],JSON.stringify(stored));
    state=JSON.parse(__webGame.call('resumeLevelGame',ui,'true'));
    assert.ok(state.flags.narrativeScene);
    console.log('PASS: save/load preserves visit-scoped narrative memory');

    fresh();
    delta=null;reply='Ánh sáng của chiếc đèn ký ức hắt lên vết nứt trong tường.';
    await turn('Cao Minh tự sáng tác một chiếc đèn ký ức.');
    assert.deepEqual(errors,[]);
    assert.ok(state.flags.narrativeLevelMemory.facts.some(x=>/đèn ký ức/.test(x)),
      'Accepted GM prose must be remembered even when AI omits narrativeDelta');
    console.log('PASS: missing AI narrativeDelta retains a bounded prose memory');

    fresh();const before=snapshot(),originalTurn=state.turn;
    core.coreItemUseBegin(JSON.stringify(state),'Khám phá');
    const denied=JSON.parse(__webGame.call('prepareNamedFollowerTurn',JSON.stringify(state),
      'Khám phá',JSON.stringify({survivor:{success:false},entityEncounter:{success:false}}),'EXPLORE'));
    assert.ok(denied.state&&denied.rolls,'Core must prepare negative survivor ticket');
    const deniedPreview=(denied.rolls.entityEncounter?.success&&denied.rolls.roamingEntityKey)
      ? 'Một bóng hình thoáng qua cuối hành lang.' : '';
    const refused=JSON.parse(core.coreCandidate(JSON.stringify(denied.state),
      JSON.stringify({itemUseRequest:null,reply:'Một người lạ bước tới.',entityPreview:deniedPreview,
        narrativeDelta:{summary:'Invented encounter',actors:[{name:'Người lạ',emotion:'sợ hãi'}]}}),
      JSON.stringify(denied.rolls),'Khám phá'));
    assert.ok(refused.bridgeError&&refused.bridgeError.includes('narrative_unconfirmed_encounter'),
      'Core must reject a new NPC without successful survivor roll: '+JSON.stringify(refused).slice(0,150));
    core.coreItemUseCancel();
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
        actors:[{name:'Tô Mộc',emotion:'biết ơn',belief:'Mình đã được cứu',intent:'ở cạnh chồng'},
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
    assert.equal(state.party.some(x=>x.name==='Tô Mộc'),false,'one-time encounter cannot become Party member');
    assert.equal(Boolean(state.flags.survivorRegistry&&JSON.stringify(state.flags.survivorRegistry).includes('Tô Mộc')),false);
    console.log('PASS: Core-approved One-Time encounter maintains independent NPC emotions');
    const originalNpc=state.flags.narrativeScene.actors[0].name;
    const memoryVisit=state.flags.narrativeScene.visit;
    delta={closed:true,summary:'Đôi vợ chồng đã an toàn và kết thúc cuộc gặp.'};
    await turn('Cao Minh chào đôi vợ chồng rồi tiếp tục đi.');
    assert.deepEqual(errors,[]);
    assert.equal(state.flags.narrativeLevelMemory.closedScenes.length,1);
    delta=null;
    for(let i=0;i<15;i++)await turn('Cao Minh tiếp tục quan sát hành lang.');
    assert.deepEqual(errors,[]);
    assert.ok(prompt.includes('Đôi vợ chồng vô danh được Cao Minh cứu sống.'),
      'A completed encounter cannot be evicted by later ambient observations');
    assert.equal(state.flags.narrativeLevelMemory.closedScenes.length,1);
    console.log('PASS: closed encounters remain remembered beyond the short recent-observation window');
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
    const finalPrepared=JSON.parse(__webGame.call('prepareNamedFollowerTurn',JSON.stringify(next),
      'Khám phá',JSON.stringify({survivor:{success:false},entityEncounter:{success:false}}),'EXPLORE'));
    assert.ok(finalPrepared.state&&finalPrepared.rolls,'final turn plan is required');
    const preview=(finalPrepared.rolls.entityEncounter?.success && finalPrepared.rolls.roamingEntityKey)
      ? 'Một dáng hình thấp thoáng ngoài rìa ánh sáng.' : '';
    const finalCandidate=JSON.parse(core.coreCandidate(JSON.stringify(finalPrepared.state),
      JSON.stringify({itemUseRequest:null,reply:'Cao Minh bước qua bức tường chập chờn.',entityPreview:preview,narrativeDelta:null}),
      JSON.stringify(finalPrepared.rolls),'Khám phá'));
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
    assert.equal(persistedFlags.narrativeSeen,undefined,'Temporary NPC identity markers expire with their visit');
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

    fresh();
    delta={actors:[{name:'Cao Minh',emotion:'bình tĩnh'}]};
    await turn('Cao Minh tự trấn an rồi quan sát hành lang.');
    assert.deepEqual(errors,[],'Known player without optional actor.id must be accepted');
    assert.equal(state.flags.narrativeScene.actors[0].id,'cao-minh');
    console.log('PASS: active canon actors do not require a redundant id in narrativeDelta');

    fresh();
    assert.equal(state.flags['luc-tram'].continuity,'SEPARATED');
    const absentActorTurn=state.turn;
    const absentActorParty=structuredClone(state.party);
    delta={summary:'Cao Minh nhớ lại Lục Trầm nhưng nàng vẫn biệt tăm.',actors:[
      {name:'Lục Trầm',id:'luc-tram',emotion:'băn khoăn'},
      {name:'Cao Minh',id:'cao-minh',emotion:'trầm tư'}
    ]};
    reply='Cao Minh đứng một mình trong hành lang và nhớ đến người bạn đồng hành đã mất liên lạc.';
    await turn('Cao Minh hồi tưởng về những người đang thất lạc.');
    assert.deepEqual(errors,[],'Optional absent-actor emotion must not invalidate a valid turn');
    assert.equal(state.turn,absentActorTurn+1);
    assert.deepEqual(state.party,absentActorParty,'An absent actor cannot join Party');
    assert.equal(state.flags['luc-tram'].continuity,'SEPARATED');
    assert.deepEqual(state.flags.narrativeScene.actors.map(actor=>actor.id),['cao-minh'],
      'Only present Core actors may receive emotional metadata');
    assert.ok(state.flags.narrativeLevelMemory.facts.some(text=>text.includes('Lục Trầm')),
      'Legitimate recollection must be retained without inventing a reunion');
    console.log('PASS: absent canon actor metadata is discarded without aborting the turn or forging an encounter');

    fresh();proposedFlags={unscopedNpcMemory:'TEMPORARY_NPC_MUST_NOT_BECOME_A_CORE_FLAG',fakeQuest:{reward:99999}};
    await turn('Cao Minh quan sát hành lang.');
    assert.deepEqual(errors,[]);
    assert.equal(state.flags.unscopedNpcMemory,undefined);
    assert.equal(state.flags.fakeQuest,undefined);
    assert.equal(state.flags.narrativeSchema,1);
    assert.equal(snapshot().saveVersion,3);
    const invalidSchema=structuredClone(state);invalidSchema.flags.narrativeSchema=2;
    const stableSnapshot=snapshot();
    assert.match(core.corePrompt(JSON.stringify(invalidSchema),'Quan sát',JSON.stringify({meta:false,turn:state.turn})),/narrative_schema_unsupported/);
    const oversized=structuredClone(state);
    oversized.flags.narrativeLevelMemory.facts=['ế'.repeat(12000)];
    assert.match(core.corePrompt(JSON.stringify(oversized),'Quan sát',JSON.stringify({meta:false,turn:state.turn})),/narrative_memory_limit/);
    assert.deepEqual(snapshot(),stableSnapshot,'Invalid memory must not mutate Core');
    console.log('PASS: versioned narrative metadata rejects unknown schemas, UTF-8 overflow and unscoped GM flags');
    const capped=structuredClone(state);
    capped.flags.narrativeLevelMemory.closedScenes=Array.from({length:12},(_,i)=>({
      sceneKey:memoryVisit+':closed:'+i,closed:true,facts:['Cuộc gặp '+i+' đã kết thúc.'],actors:[{name:'Người khách '+i}]
    }));
    core.coreItemUseBegin(JSON.stringify(capped),'Khám phá');
    const exhausted=JSON.parse(core.coreCandidate(JSON.stringify(capped),JSON.stringify({
      itemUseRequest:null,reply:'Một người khách mới bước tới.',entityPreview:'',
      narrativeDelta:{actors:[{name:'Người khách mới'}]}
    }),JSON.stringify({survivor:{success:true},entityEncounter:{success:false}}),'Khám phá'));
    core.coreItemUseCancel();
    assert.match(exhausted.bridgeError,/narrative_encounter_budget_exhausted/);
    assert.deepEqual(snapshot(),stableSnapshot,'A full encounter budget must not evict existing memory');
    const legacy=structuredClone(stableSnapshot),legacyFlags=JSON.parse(legacy.world.flagsJson);
    for(const key of ['narrativeSchema','narrativeScene','narrativeLevelMemory','narrativeRelations','narrativeSeen'])delete legacyFlags[key];
    legacyFlags.legacyQuest={accepted:true};
    legacy.world.flagsJson=JSON.stringify(legacyFlags);
    const legacyUi=JSON.parse(legacy.world.levelTravelUi);legacyUi.flags=legacyFlags;
    legacy.world.levelTravelUi=JSON.stringify(legacyUi);
    core.coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'],JSON.stringify(legacy));
    state=JSON.parse(__webGame.call('resumeLevelGame',JSON.stringify({...legacyUi,coreSnapshot:legacy}),true));
    errors=[];proposedFlags={};
    await turn('Cao Minh tiếp tục quan sát hành lang.');
    assert.deepEqual(errors,[]);
    assert.equal(state.flags.legacyQuest.accepted,true,'Legacy Core flags must remain intact');
    assert.equal(state.flags.narrativeSchema,1);
    assert.equal(snapshot().saveVersion,3);
    console.log('PASS: full encounter budgets preserve memory, and legacy v3 saves gain additive narrative metadata');
  }finally{Math.random=random}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>clearTimeout(watchdog));
