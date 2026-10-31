const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Math.random = () => 0.61; });
    let marker = { itemId: 'com-tam' }, requests = 0;
    await page.route('https://backrooms-gemini-proxy.onrender.com/**', async route => {
      requests++;
      const response = { itemUseRequest: marker, reply: 'Cao Minh quan sát vết tích trên thảm.', entityPreview: 'Một âm thanh vọng lại.' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }) });
    });
    await page.goto('http://127.0.0.1:4173/Backrooms/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.coreSnapshot && state.levelTravel);
    await page.evaluate(() => {
      const saved = JSON.parse(Android.levelCoreSnapshot());
      saved.inventories['cao-minh'].items['com-tam'] = { itemId: 'com-tam', archetypeId: 'com-tam', name: 'Cơm tấm', quantity: 2, contentState: 'NONE', condition: 'READY', metadata: { category: 'food', consumedOnUse: 'true' } };
      coreInit(BACKROOMS_ASSETS['knowledge/level_travel_policy.json'], JSON.stringify(saved));
      window.backroomTurn(Android.resumeLevelGame(JSON.stringify(state), true));
    });
    const before = await page.evaluate(() => ({ core: Android.levelCoreSnapshot(), turn: state.turn, travel: state.levelTravel }));
    await page.locator('#submit').click();
    await page.locator('#action').fill('Ăn cơm tấm');
    await page.locator('#playerActionConfirm').click();
    await page.waitForFunction(() => !busy && state.log.at(-1)?.text === 'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
    assert.equal(await page.locator('#status').innerText(), 'Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.');
    assert.deepEqual(await page.evaluate(() => ({ core: Android.levelCoreSnapshot(), turn: state.turn, travel: state.levelTravel })), before);
    await page.screenshot({ path: 'build/inventory-use-gm-redirect.png' });
    const count = requests;
    await page.locator('#mobileMenuButton').click();
    await page.locator('#party .party-member[data-character="cao-minh"]').click();
    await page.locator('#characterInventoryItems [data-item-id="com-tam"]').click();
    assert.equal(await page.locator('#equipmentDetailModal').isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.parse(Android.levelCoreSnapshot()).inventories['cao-minh'].items['com-tam'].quantity), 2, 'Opening an item must not consume it');
    await page.screenshot({ path: 'build/inventory-use-explicit-button.png' });
    await page.locator('#itemActionUse').click();
    await page.waitForFunction(() => !busy && JSON.parse(Android.levelCoreSnapshot()).inventories['cao-minh'].items['com-tam'].quantity === 1);
    assert.equal(requests, count, 'Inventory use must not call GM');
    await page.locator('#characterInventoryBack').click();
    await page.locator('#mobileMenuClose').click();
    marker = null;
    const number = await page.evaluate(() => state.turn);
    await page.locator('#submit').click();
    await page.locator('#action').fill('Dùng thần thức kiểm tra căn phòng');
    await page.locator('#playerActionConfirm').click();
    await page.waitForFunction(t => !busy && state.turn === t + 1, number);
    assert.equal(requests, count + 1);
    assert.deepEqual(errors, []);
    console.log('PASS: visible GM redirect, preserved Core, explicit Inventory use and ability narration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
