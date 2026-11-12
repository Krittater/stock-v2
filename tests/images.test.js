const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const Seed = require('../mockup/js/seed.js'); const Credits = require('../mockup/img/credits.js');
const root = path.join(__dirname, '../mockup'); const s = Seed.build();
const used = [...s.categories, ...s.products].map(x => x.image).filter(Boolean);
const OK = /^(CC0|Public domain|No restrictions|CC BY(-SA)? [\d.]+)$/;
test('every category has an image', () => assert.ok(s.categories.every(c => c.image)));
test('every referenced image exists, is small, and is credited', () => {
  for (const p of new Set(used)) {
    const f = path.join(root, p);
    assert.ok(fs.existsSync(f), p);
    assert.ok(fs.statSync(f).size <= 60 * 1024, p);
    const c = Credits[p]; assert.ok(c, 'no credit: ' + p);
    if (c.kind === 'photo') assert.ok(OK.test(c.license) && c.author && c.source.startsWith('https://'), p);
  }
});
test('no orphan files', () => {
  for (const dir of ['img/photo', 'img/draw'])
    for (const f of fs.readdirSync(path.join(root, dir))) assert.ok(Credits[`${dir}/${f}`], 'orphan ' + f);
});
