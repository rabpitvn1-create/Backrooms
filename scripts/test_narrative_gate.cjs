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

const watchdog=setTimeout(()=>{console.error('Narrative gate did not complete');process.exit(1);},30000);
(async()=>{
 Math.random=()=>0.61;
 const findings=[];
 fresh();
 delta={actors:[{name:'Lục Trầm',emotion:'lo lắng'}],summary:'Nhớ Lục Trầm đang thất lạc.'};
 reply='Cao Minh nhớ lại Lục Trầm, hắn vẫn chưa biết nàng ở đâu.';
 await turn('Cao Minh hồi tưởng về Lục Trầm.');
 findings.push({name:'absent_canon_without_optional_id',ok:errors.length===0,error:errors,turn:state.turn});
 fresh();
 delta={actors:[{name:'Lục Trầm',id:'luc-tram'}],summary:'Lục Trầm đã gặp lại Cao Minh.'};
 reply='Lục Trầm bước tới trước mặt Cao Minh và nắm tay hắn.';
 await turn('Cao Minh nhìn quanh hành lang.');
 findings.push({name:'prose_forged_reunion_with_absent_metadata',ok:errors.length>0,errors,committed:state.turn>1});
 fresh();delta=null;reply='Lục Trầm bước tới trước mặt Cao Minh và nắm tay hắn.';
 await turn('Cao Minh nhìn quanh hành lang.');
 findings.push({name:'prose_forged_reunion_without_metadata',ok:errors.length>0,errors,committed:state.turn>1});
 fresh();
 backroomTurn=raw=>{state=JSON.parse(raw);throw new Error('fixture_ui_delivery_failure');};
 await turn('Cao Minh lắng nghe tiếng đèn.');
 findings.push({name:'callback_after_ui_state_updated',ok:state.turn===JSON.parse(snapshot().world.levelTravelUi).turn,uiTurn:state.turn,coreTurn:JSON.parse(snapshot().world.levelTravelUi).turn,errors});
 backroomTurn=raw=>{state=JSON.parse(raw)};
 fresh(); const originalFetch=fetch;let newRun;
 fetch=async(...args)=>{const response=await originalFetch(...args);newRun=JSON.parse(Android.initializeLevelGame(JSON.stringify(initial),true)).levelTravel.runId;return response;};
 await turn('Cao Minh lắng nghe tiếng đèn.');fetch=originalFetch;
 findings.push({name:'new_game_during_model_response',ok:JSON.parse(snapshot().world.levelTravel).runId===newRun,expected:newRun,actual:JSON.parse(snapshot().world.levelTravel).runId,errors});
 fs.writeFileSync('build/narrative-gate-probe.json',JSON.stringify(findings,null,2));
 if(findings.some(f=>!f.ok)&&!process.argv.includes('--probe'))process.exitCode=1;
 console.log(JSON.stringify(findings,null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>clearTimeout(watchdog));
