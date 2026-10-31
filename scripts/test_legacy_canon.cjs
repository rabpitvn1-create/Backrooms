const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const original={
  'knowledge_db.json':['2aa0bab18af8b2354efc11a02f70a694630012cd',114],
  'level_0_canon_cards.json':['bd8650e75031cfdd118092dab6b514822fa2fc78',109],
  'level_1plus_canon_cards.json':['676704787900e276e9c9616f5240df61c5e85236',38],
};
for(const [name,[sha,count]] of Object.entries(original)){
 const archived='Legacy/knowledge/'+name;
 assert.ok(fs.existsSync(archived),'Legacy archive is missing: '+archived);
 assert.ok(!fs.existsSync('web/knowledge/'+name),'Old Canon should no longer be an active source file: '+name);
 const raw=fs.readFileSync(archived);
 const hash=crypto.createHash('sha1').update('blob '+raw.length+'\\0'.replace('\\0','\0')).update(raw).digest('hex');
 assert.equal(hash,sha,'Legacy archive must be an exact Git-blob copy of '+name);
 const data=JSON.parse(raw.toString('utf8'));
 assert.equal(data.records.length,count,'Record count unchanged for '+name);
}
assert.ok(fs.existsSync('web/knowledge/KeyCanon.json'),'Active KeyCanon must remain in place');
assert.ok(fs.existsSync('web/knowledge/level_travel_policy.json'),'Travel policy must remain active');
console.log('PASS: Original Canon archived byte-for-byte, with KeyCanon still active');
