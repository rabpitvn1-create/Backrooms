/* End-to-end real-provider narrative contract on the non-deployed PR preview. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:412,height:915}});
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Math.random=()=>0.61;
      window.__narrativeModelEvidence=[];
      const upstream=window.fetch;
      window.fetch=async (...args) => {
        const response=await upstream(...args);
        if(String(args[0]).includes('/gemini')&&response.ok){
          try{
            const payload=await response.clone().json();
            const modelText=(payload.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');
            const output=JSON.parse(modelText.replace(/^\x60\x60\x60(?:json)?\\s*|\\s*\x60\x60\x60$/g,''));
            window.__narrativeModelEvidence.push({
              keys:Object.keys(output).sort(),
              hasDelta:Object.hasOwn(output,'narrativeDelta'),
              deltaType:output.narrativeDelta===null?'null':typeof output.narrativeDelta,
              summaryLength:typeof output.narrativeDelta?.summary==='string'?output.narrativeDelta.summary.length:0
            });
          } catch(_) {window.__narrativeModelEvidence.push({parseError:true});}
        }
        return response;
      };
    });
    await page.goto(process.env.PAGES_TEST_URL || 'http://127.0.0.1:4173/Backrooms/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => typeof state !== 'undefined' && state.coreSnapshot && state.levelTravel);
    const before = await page.evaluate(() => ({
      turn:state.turn, node:state.levelTravel.nodeId,
      inventory:JSON.parse(Android.levelCoreSnapshot()).inventories
    }));
    async function action(text) {
      const turn=await page.evaluate(() => state.turn);
      await page.locator('#submit').click();
      await page.locator('#action').fill(text);
      await page.locator('#playerActionConfirm').click();
      await page.waitForFunction(t => !busy && state.turn === t + 1,turn,{timeout:180000});
      const result=await page.evaluate(() => ({
        turn:state.turn,reply:state.log.at(-1)?.text||'',
        narrative:state.flags?.narrativeLevelMemory?.facts||[],
        items:JSON.parse(Android.levelCoreSnapshot()).inventories,
        status:__webGame.events.filter(e=>e.kind==='provider').map(e=>e.status)
      }));
      assert.ok(result.reply.length>35,'GM must narrate a complete scene');
      assert.ok(!/action not available|item not found|vật phẩm không tồn tại/i.test(result.reply),
        'Non-ID creative prose was incorrectly rejected');
      assert.ok(result.status.includes(200),'Live provider must respond');
      return result;
    }
    const first=await action('Cao Minh tự sáng tác một ngọn đèn ký ức bằng ý niệm để soi rõ vết nứt trên bức tường. Đây không phải vật phẩm trong kho đồ.');
    assert.deepEqual(first.items,before.inventory,'Fictional lamp must never create Inventory items');
    const modelEvidence=await page.evaluate(()=>window.__narrativeModelEvidence);
    console.log('Actual model JSON contract:',JSON.stringify(modelEvidence));
    assert.ok(first.narrative.some(x=>/đèn|ánh sáng|vết nứt|ý niệm/i.test(x)),
      'Real GM did not commit a meaningful narrativeDelta for the original Non-ID object');
    const second=await action('Cao Minh nhớ lại ngọn đèn ký ức vừa tự tạo và nhìn kỹ vết nứt một lần nữa.');
    assert.equal(second.turn,before.turn+2);
    assert.ok(second.narrative.length>0,'Scene memory must remain available in same Level');
    assert.deepEqual(second.items,before.inventory,'Narrative follow-up must preserve Inventory');
    assert.deepEqual(errors,[],'The live browser must be free from page errors');
    await page.screenshot({path:'build/playable-live-narrative.png'});
    console.log('PASS: two real Gemini turns, Non-ID invention, current-Level memory, unchanged Inventory and persisted Core state');
    console.log('Narrative memory evidence:',JSON.stringify({
      firstFacts:first.narrative.length,secondFacts:second.narrative.length,
      providerStatus:second.status
    }));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1});
