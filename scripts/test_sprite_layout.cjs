const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'web/characters/cao-minh-assets.json')));
const window = {};
const document = {getElementById: () => null};
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/sprite-layout.js'), 'utf8'), {window, document});
const layout = window.backroomSpriteLayout;
const prefix = 'https://res.cloudinary.com/csz2me5b/image/upload/';
const sprites = [
  [registry.assets.find(a => a.role === 'combat').url, [1024,1536,112,0,962,1508], 'right'],
  [registry.assets.find(a => a.role === 'exploration').url, [1086,1448,184,4,962,1428], 'right'],
  [prefix + 'v1792832584/Entity_Hound.webp', [941,1672,12,199,941,1556], 'left'],
  [prefix + 'v1792832597/Entity_Clump.webp', [864,1536,36,267,841,1230], 'left'],
  [prefix + 'e_trim/v1792832592/Entity_The_Lifeform_Bacteria_01.webp', [555,1637,0,0,555,1637], 'left']
];
function fitted(source, box, side) {
  const style = {};
  layout.fit({getAttribute: () => source, naturalWidth: 1, naturalHeight: 1,
    style: {setProperty: (key, value) => {style[key] = parseFloat(value);}}}, box, side);
  return style;
}
function checkFloor(style, b) {
  const scale = style['--sprite-height'] / b[1];
  const visibleBottom = style['--sprite-bottom'] + (b[1] - b[5]) * scale;
  assert.ok(Math.abs(visibleBottom) < 1e-8, 'Visible feet must touch the stage floor');
  assert.ok(Math.abs(style['--sprite-width'] / style['--sprite-height'] - b[0] / b[1]) < 1e-8,
    'Grounding must preserve the original aspect ratio');
}
for (const [width, height] of [[296,140], [388,274], [406,300]]) {
  const box = {clientWidth: width, clientHeight: height};
  for (const [url, b, side] of sprites) {
    const online = fitted(url, box, side);
    checkFloor(online, b);
    if (side === 'left') {
      const scale = online['--sprite-height'] / b[1];
      assert.ok((b[4] - b[2]) * scale <= width * .455 + 1e-8, 'Entity stays in its lane');
    } else {
      const role = registry.assets.find(a => a.url === url).role;
      for (const session of [1, 2]) {
        const blob = 'blob:session-' + session + '-' + role;
        window.backroomOfflineCharacterAssets = {registry, resolve: r => r === role ? blob : null};
        assert.deepEqual(fitted(blob, box, side), online, 'Cached art keeps the online floor and scale');
      }
    }
  }
}
assert.equal(layout.geometry([10,10,0,0,10,10], 0, 100, 'right'), null);
assert.equal(layout.geometry([10,10,0,0,10,11], 100, 100, 'left'), null);
assert.deepEqual(fitted('unknown', {clientWidth:0, clientHeight:0}, 'left'), {});
console.log('PASS sprite grounding: online/cache, combat/exploration, Entity shapes, resize, aspect ratio');
