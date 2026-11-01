const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
vm.runInThisContext(fs.readFileSync('pages/regex.js', 'utf8'));
const core = require('../engine/target/javascript/game-core.js');
Object.assign(globalThis, core);
globalThis.window = globalThis;
globalThis.document = { documentElement: { dataset: {} } };
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
globalThis.BACKROOMS_ASSETS = {};
for (const dir of ['knowledge', 'canon']) for (const name of fs.readdirSync('web/' + dir)) {
  if (/\.(json|md)$/.test(name)) BACKROOMS_ASSETS[dir + '/' + name] = fs.readFileSync('web/' + dir + '/' + name, 'utf8');
}
for (const name of ['knowledge_db.json', 'level_0_canon_cards.json', 'level_1plus_canon_cards.json'])
  BACKROOMS_ASSETS['knowledge/' + name] = fs.readFileSync('Legacy/knowledge/' + name, 'utf8');
globalThis.BACKROOMS_CONFIG = { models: ['fixture'] };
vm.runInThisContext(fs.readFileSync('pages/bridge.js', 'utf8'));
const html = fs.readFileSync('web/index.html', 'utf8');
const initial = vm.runInNewContext(html.slice(html.indexOf('const prologue'), html.indexOf('const byId')) + '; initial');
let state, errors = [], requests = 0, marker = null, narrationOverride = null, narrativeSummaryOverride = null, previewOverride = null;
globalThis.backroomTurn = raw => { state = JSON.parse(raw); };
globalThis.backroomError = message => errors.push(message);
globalThis.backroomProvider = () => {};
globalThis.backroomItemAction = raw => { const result = JSON.parse(raw); assert.equal(result.handled, true, result.error); state = result.state; };
globalThis.fetch = async (_, options) => {
  requests++;
  const prompt = JSON.parse(options.body).contents[0].parts[0].text;
  assert.ok(prompt.includes('[INVENTORY USE ONLY]'));
  assert.ok(prompt.includes('"almond-water":"Almond Water"'));
  const generated = { reply: narrationOverride || 'Cao Minh quan sát những dấu vết trước mặt.', entityPreview: previewOverride || 'Một tiếng động vọng tới.' };
  if (narrativeSummaryOverride) generated.narrativeDelta = { summary: narrativeSummaryOverride };
  if (marker !== undefined) generated.itemUseRequest = marker;
  if (marker) Object.assign(generated, { reply: '', player: { hp: 999999 }, inventory: [{ id: 'fake', quantity: 100 }], flags: { fakeItemEffect: true } });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }] }), { status: 200 });
};
const call = (name, ...args) => JSON.parse(__webGame.call(name, ...args));
const snapshot = () => JSON.parse(Android.levelCoreSnapshot());
function fresh(withFood = false) {
  state = JSON.parse(Android.initializeLevelGame(JSON.stringify(initial), true));
  if (withFood) {
    const saved = snapshot();
    saved.inventories['cao-minh'].items['com-tam'] = { itemId: 'com-tam', archetypeId: 'com-tam', name: 'Cơm tấm', quantity: 2, condition: 'READY', contentState: 'NONE', metadata: { category: 'food', consumedOnUse: 'true' } };
    core.coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'], JSON.stringify(saved));
    state = call('resumeLevelGame', JSON.stringify(state), 'true');
  }
  errors = [];
}
async function turn(action) {
  await Android.submitGameplayAction(JSON.stringify(state), 'EXECUTE', action);
  await __webGame.idle;
}
(async () => {
  Math.random = () => 0.61;
  for (const action of ['Dùng thần niệm', 'Dùng ý niệm', 'Dùng thần thức', 'Quét thần thức quanh phòng', 'Dùng ý niệm điều khiển ma kiếm', 'Dùng tay mở cửa', 'Dùng thần niệm nhìn chai Almond Water', 'Không dùng Almond Water', 'Anh ấy nói “dùng Almond Water”']) {
    fresh(); marker = null;
    const before = snapshot(), count = requests, number = state.turn;
    for (const method of ['processRule', 'processNamedFollowerRule']) {
      const result = call(method, JSON.stringify(state), action);
      assert.equal(result.handled, false, action + ' ' + method);
      assert.deepEqual(snapshot(), before, 'Text rules must not execute item use');
    }
    await turn(action);
    assert.deepEqual(errors, [], action);
    assert.equal(requests, count + 1, action + ' reaches GM');
    assert.equal(state.turn, number + 1);
    assert.deepEqual(snapshot().inventories, before.inventories);
  }
  for (const action of ['Hỏi cách dùng Almond Water', 'Xem hướng dẫn sử dụng Almond Water',
      'Cao Minh cho rằng Almond Water vẫn còn', 'Cao Minh không hề uống Almond Water',
      'Cao Minh không muốn uống Almond Water', 'Cao Minh không định dùng Almond Water',
      'Cao Minh hỏi liệu có nên uống Almond Water?', 'Sử dụng Almond Water được không?']) {
    fresh(); marker = null;
    const count = requests;
    await turn(action);
    assert.deepEqual(errors, [], action);
    assert.equal(requests, count + 1, 'Item discussions must reach GM: ' + action);
    assert.notEqual(state.log.at(-1).text, 'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
  }
  console.log('PASS: questions, opinions and extended negations do not trigger false Inventory redirects');
  fresh(); marker = null;
  narrationOverride = 'Cao Minh không muốn uống Almond Water. Hắn tiếp tục quan sát.';
  await turn('Cao Minh lặng nghe tiếng đèn.');
  assert.deepEqual(errors, [], 'Negated GM prose must not trigger an Inventory conflict');
  narrationOverride = null;
  console.log('PASS: abilities, weapon control, observation, negation and quotes reach GM without using items');
  for (const action of ['Sử dụng Almond Water', 'Tu một ngụm nước hạnh nhân', 'Nhờ Hứa Tiểu Lan uống Almond Water', 'Dùng thần niệm rồi uống Almond Water']) {
    fresh(); marker = { itemId: 'almond-water' };
    const before = snapshot(), ui = structuredClone(state), count = requests;
    await turn(action);
    assert.deepEqual(errors, []);
    assert.equal(requests, count + 1, 'GM must classify the request');
    assert.deepEqual(snapshot(), before, 'Blocked use restores the entire Core checkpoint');
    assert.equal(state.turn, ui.turn);
    assert.deepEqual(state.levelTravel, ui.levelTravel);
    assert.deepEqual(state.inventory, ui.inventory);
    assert.deepEqual(state.player, ui.player);
    assert.equal(state.log.at(-1).text, 'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
    assert.equal(state.flags.fakeItemEffect, undefined);
    marker = null;
    await turn('Dùng thần thức kiểm tra xung quanh');
    assert.deepEqual(errors, [], 'A redirected turn must be retryable');
    assert.equal(state.turn, ui.turn + 1);
  }
  console.log('PASS: GM-confirmed item use, paraphrases, follower and mixed requests never consume a turn, item, effect or exit streak');
  // The LLM can misclassify a registered item as a fictional Non-ID item.
  // Registered inventory use must be enforced by Core even if itemUseRequest is null.
  for (const action of ['Sử dụng Almond Water', 'Tu một ngụm nước hạnh nhân', 'Nhờ Hứa Tiểu Lan uống Almond Water']) {
    fresh(); marker = null;
    const before = snapshot(), turnNumber = state.turn;
    await turn(action);
    assert.deepEqual(errors, [], 'Registered item misclassification must redirect: ' + action);
    assert.deepEqual(snapshot(), before);
    assert.equal(state.turn, turnNumber);
    assert.equal(state.log.at(-1).text, 'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
  }
  fresh(); marker = null;
  narrationOverride = 'Cao Minh đã uống Almond Water và hồi phục ngay lập tức.';
  const beforeNarration = snapshot(), beforeTurn = state.turn;
  await turn('Cao Minh nhìn quanh căn phòng.');
  assert.ok(errors.some(error => /item_use_narrative_conflict/.test(error)));
  assert.deepEqual(snapshot(), beforeNarration);
  assert.equal(state.turn, beforeTurn);
  narrationOverride = null;
  for (const action of ['Almond Water, uống ngay', 'Almond Water, Cao Minh sử dụng ngay', 'Nước hạnh nhân, uống đi']) {
    fresh();marker=null;
    const original=snapshot(),turnNo=state.turn;
    await turn(action);
    assert.deepEqual(errors,[],'Item-first imperative must redirect: '+action);
    assert.deepEqual(snapshot(),original,'Item-first command must preserve Core state');
    assert.equal(state.turn,turnNo,'Item-first command must not consume a turn');
    assert.equal(state.log.at(-1).text,'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
  }
  for (const action of ['Almond Water, uống được không?', 'Almond Water, sử dụng thế nào?']) {
    fresh();marker=null;
    const originalTurn=state.turn;
    await turn(action);
    assert.deepEqual(errors,[],'Item-first question must not redirect: '+action);
    assert.equal(state.turn,originalTurn+1,'Question must reach GM');
  }
  for (const field of ['summary','entityPreview']) {
    fresh();marker=null;
    const original=snapshot(),turnNo=state.turn;
    if(field==='summary')narrativeSummaryOverride='Cao Minh uống Almond Water để hồi phục.';
    else previewOverride='Cao Minh sử dụng Almond Water để hồi phục.';
    await turn('Cao Minh lắng nghe tiếng đèn.');
    assert.ok(errors.some(e=>/item_use_narrative_conflict/.test(e)),field+' cannot record unapproved registered item use');
    assert.deepEqual(snapshot(),original,field+' conflict must roll back Core');
    assert.equal(state.turn,turnNo);
    narrativeSummaryOverride=null;previewOverride=null;
  }
  console.log('PASS: item-first imperatives are redirected, questions remain legal, and fake delta/preview uses are rejected');
  console.log('PASS: registered item use cannot bypass Inventory through a false null classification');
  for (const invalid of [undefined, { itemId: 'gm-invented-item' }, 'almond-water', {}]) {
    fresh(); marker = invalid;
    const before = snapshot();
    await turn('Sử dụng Almond Water');
    assert.ok(errors.some(error => /item_use_(classification_missing|id_invalid)/.test(error)));
    assert.deepEqual(snapshot(), before, 'Invalid classifications cannot commit staged changes');
  }
  console.log('PASS: missing, malformed and fabricated item IDs fail without changing Core');
  fresh(); marker = null;
  const checkpoint = snapshot(), uiTurn = state.turn, savedRng = Math.random;
  Math.random = () => 0.01;
  narrationOverride = 'Cao Minh cạn ma nguyên.';
  await Android.submitGameplayAction(JSON.stringify(state), 'SEARCH', 'search');
  await __webGame.idle;
  narrationOverride = null;
  Math.random = savedRng;
  assert.ok(errors.some(error => /canon_validation_failed/.test(error)), 'fixture must be rejected after classification');
  assert.deepEqual(snapshot(), checkpoint, 'Rejected GM response must roll back Core loot and command receipts');
  assert.equal(state.turn, uiTurn, 'Rejected turn cannot advance UI');
  console.log('PASS: rejected post-classification GM turn restores entire Core checkpoint');
    fresh(true); marker = { itemId: 'com-tam' };
  const before = snapshot();
  await turn('Ăn cơm tấm');
  assert.deepEqual(snapshot(), before);
  const count = requests;
  await Android.itemAction(JSON.stringify(state), JSON.stringify({ operation: 'USE', actorId: 'cao-minh', itemId: 'com-tam', quantity: 1 }));
  await __webGame.idle;
  assert.deepEqual(errors, []);
  assert.equal(snapshot().inventories['cao-minh'].items['com-tam'].quantity, 1);
  assert.equal(requests, count, 'Inventory use is local');
  const saved = Android.levelCoreSnapshot();
  core.coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'], saved);
  state = call('resumeLevelGame', JSON.stringify(state), 'true');
  assert.equal(snapshot().inventories['cao-minh'].items['com-tam'].quantity, 1);
  console.log('PASS: explicit Inventory USE still consumes exactly once and survives save/load');
})().catch(error => { console.error(error); process.exitCode = 1; });
