'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
vm.runInThisContext(fs.readFileSync('pages/regex.js','utf8'));
const core=require('../engine/target/javascript/game-core.js');
Object.assign(globalThis,core);
globalThis.window=globalThis;
// Legacy narrator dice use java.util.Random independently of Math.random.
const originalRolls=window.coreRolls;
window.coreRolls=(...args)=>{
  const rolls=JSON.parse(originalRolls(...args));
  for(const key of ['survivor','entityEncounter','hazard','loot','almondWater','lucTramReunion','syvialReunion','anNhienEncounter','huaTieuLanEncounter','nguyenQuocNamEncounter'])
    if(rolls[key])rolls[key].success=false;
  return JSON.stringify(rolls);
};
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

const watchdog=setTimeout(()=>{console.error('Narrative gate did not complete');process.exit(1);},30000);
(async()=>{
 Math.random=()=>0.61;
 const findings=[];
 fresh();const mentionTurn=state.turn;
 reply='Không có tin tức mới về Lục Trầm, người vẫn đang thất lạc.';
 await turn('Tìm kiếm');
 findings.push({name:'absent_canon_mention_without_physical_encounter',
   ok:errors.length===0&&state.turn===mentionTurn+1,errors});
 fresh();
 reply='Lục Trầm vẫn chưa hồi đáp, Cao Minh tiếp tục quan sát.';
 await turn('Tìm kiếm');
 findings.push({name:'absent_canon_no_reply_does_not_assert_presence',
   ok:errors.length===0,errors});
 fresh();
 delta={actors:[{name:'Lục Trầm',emotion:'lo lắng'}],summary:'Nhớ Lục Trầm đang thất lạc.'};
 reply='Cao Minh nhớ lại Lục Trầm, hắn vẫn chưa biết nàng ở đâu.';
 await turn('Cao Minh hồi tưởng về Lục Trầm.');
 findings.push({name:'absent_canon_without_optional_id',ok:errors.length===0,error:errors,turn:state.turn});
 fresh();const beforeFake=snapshot();
 delta={actors:[{name:'Lục Trầm',id:'luc-tram'}],summary:'Lục Trầm đã gặp lại Cao Minh.'};
 reply='Lục Trầm bước tới trước mặt Cao Minh và nắm tay hắn.';
 await turn('Cao Minh nhìn quanh hành lang.');
 findings.push({name:'prose_forged_reunion_with_absent_metadata',ok:errors.length>0&&JSON.stringify(snapshot())===JSON.stringify(beforeFake),errors,committed:state.turn>1});
 fresh();const beforeNoDelta=snapshot();delta=null;reply='Lục Trầm bước tới trước mặt Cao Minh và nắm tay hắn.';
 await turn('Cao Minh nhìn quanh hành lang.');
 findings.push({name:'prose_forged_reunion_without_metadata',ok:errors.length>0&&JSON.stringify(snapshot())===JSON.stringify(beforeNoDelta),errors,committed:state.turn>1});
 for(const text of ['Cao Minh nhớ Lục Trầm rồi Lục Trầm bất ngờ xuất hiện trước mặt hắn.',
     'Cao Minh không do dự khi Lục Trầm bước tới trước mặt hắn.',
     'Cao Minh nhớ Lục Trầm nhưng bỗng Lục Trầm đứng ngay trước mặt hắn.',
     'Lục Trầm đứng cạnh hắn và không biết hắn ở đâu.']) {
   fresh();const before=snapshot();reply=text;
   await turn('Cao Minh lắng nghe tiếng đèn.');
   findings.push({name:'reference_cues_cannot_authorize_present_tense_reunion',ok:errors.length>0&&JSON.stringify(before)===JSON.stringify(snapshot()),errors});
 }
 fresh();delta=null;reply='Cao Minh nhớ Lục Trầm rồi lại nhớ Lục Trầm trong những ngày xa cách.';
 const recollectionBefore=state.turn;
 await turn('Cao Minh hồi tưởng về Lục Trầm.');
 findings.push({name:'repeated_recollection_remains_legal',ok:errors.length===0&&state.turn===recollectionBefore+1,errors});
 fresh();const summaryBefore=snapshot();delta={summary:'Lục Trầm đã gặp lại Cao Minh.'};
 await turn('Cao Minh lắng nghe tiếng đèn.');
 findings.push({name:'summary_cannot_persist_fabricated_reunion',ok:errors.length>0&&JSON.stringify(summaryBefore)===JSON.stringify(snapshot()),errors});
 fresh();const unknownBefore=snapshot();
 delta={actors:[{name:'Người không có thật',id:'unregistered-npc'}]};
 await turn('Cao Minh quan sát hành lang.');
 findings.push({name:'unknown_id_cannot_bypass_encounter_validation',ok:errors.some(e=>e.includes('narrative_actor_unknown_id'))&&JSON.stringify(snapshot())===JSON.stringify(unknownBefore),errors});
 fresh();const storageBefore=snapshot(),durableBefore=store.get('backrooms-web-core-v1');
 const setItem=localStorage.setItem;
 localStorage.setItem=(k,v)=>{if(k==='backrooms-web-core-v1')throw new Error('fixture_storage_failure');setItem(k,v);};
 await turn('Cao Minh quan sát hành lang.');localStorage.setItem=setItem;
 findings.push({name:'persistence_failure_preserves_core_and_durable_save',ok:errors.some(e=>e.includes('fixture_storage_failure'))&&JSON.stringify(snapshot())===JSON.stringify(storageBefore)&&store.get('backrooms-web-core-v1')===durableBefore,errors});
 fresh();const persistedBefore=store.get('backrooms-web-core-v1'),fetchBefore=fetch;let stagedWrites=false;
 fetch=async(...args)=>{stagedWrites=store.get('backrooms-web-core-v1')!==persistedBefore;return fetchBefore(...args);};
 await turn('Cao Minh quan sát hành lang.');fetch=fetchBefore;
 findings.push({name:'intermediate_core_is_not_persisted_before_model_acceptance',ok:!stagedWrites,errors});
 fresh();
 backroomTurn=raw=>{state=JSON.parse(raw);throw new Error('fixture_ui_delivery_failure');};
 await turn('Cao Minh lắng nghe tiếng đèn.');
 findings.push({name:'callback_after_ui_state_updated',ok:state.turn===JSON.parse(snapshot().world.levelTravelUi).turn,uiTurn:state.turn,coreTurn:JSON.parse(snapshot().world.levelTravelUi).turn,errors});
 backroomTurn=raw=>{state=JSON.parse(raw)};
 fresh(); const originalFetch=fetch;let newRun;
 fetch=async(...args)=>{const response=await originalFetch(...args);newRun=JSON.parse(Android.initializeLevelGame(JSON.stringify(initial),true)).levelTravel.runId;return response;};
 await turn('Cao Minh lắng nghe tiếng đèn.');fetch=originalFetch;
 findings.push({name:'new_game_during_model_response',ok:JSON.parse(snapshot().world.levelTravel).runId===newRun,expected:newRun,actual:JSON.parse(snapshot().world.levelTravel).runId,errors});
 fresh();const coreTurn=state.turn,coreRun=state.levelTravel.runId;
 state={...state,turn:coreTurn+2};
 await turn('Quan sát');
 const staleDetected=errors.some(e=>e.includes('stale_level_turn'));
 const uiResynced=state.turn===coreTurn&&state.levelTravel.runId===coreRun;
 errors=[];
 await turn('Quan sát');
 findings.push({name:'stale_ui_resync_allows_next_turn',
   ok:staleDetected&&uiResynced&&errors.length===0&&state.turn===coreTurn+1,
   staleDetected,uiResynced,errors});
 fs.writeFileSync('build/narrative-gate-probe.json',JSON.stringify(findings,null,2));
 if(findings.some(f=>!f.ok)&&!process.argv.includes('--probe'))process.exitCode=1;
 console.log(JSON.stringify(findings,null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>clearTimeout(watchdog));
