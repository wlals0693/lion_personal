// Local fake gateway contract test. Generated files stay in ignored test-results.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let photos=0;const protocols=[];
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/gpu/health')return res.end(JSON.stringify({ready:true}));
  if(req.url==='/api/garments/analyze'){
    const type=photos<3?'t_shirt':photos<6?'trousers':'sneakers';photos++;
    return res.end(JSON.stringify({type,sleeve:type==='t_shirt'?'short':'unknown',name:'TEST FIXTURE',color:'차콜',style:'캐주얼',pattern:'무지',neckline:'',materialGuess:'',uncertainFields:[],inferenceMs:0}));
  }
  if(req.url==='/api/outfits/evaluate'){
    const body=JSON.parse(Buffer.concat(chunks));protocols.push(body.protocol);
    return res.end(JSON.stringify({protocol:body.protocol,seconds:0,results:body.candidates.map(c=>({id:c.id,evaluation:{visual:'ordinary',context:'suitable',decision:'recommend',protocol:body.protocol==='outfit-v2-evidence'?body.protocol:undefined,reasons:[{aspect:'overall',observation:'TEST FIXTURE',evidence:'TEST',itemIds:c.itemIds.slice(0,2)}],contextReason:'TEST',limitations:['TEST ONLY']}}))}));
  }
  res.statusCode=404;res.end('{}');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const out=`test-results/capture-fixture-${Date.now()}`;
  const child=spawn(process.execPath,['--import','tsx','scripts/capture-presentation.ts','--photos','test-results/demo_today_ready','--url',`http://127.0.0.1:${server.address().port}`,'--out',out],{stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
  assert.equal(code,0,logs);assert.equal(photos,9);assert.deepEqual(protocols,['outfit-v1-contact-sheet',...Array(3).fill('outfit-v2-evidence')]);
  const pack=JSON.parse(await readFile(`${out}/presentation.json`,'utf8'));
  assert.equal(pack.items.length,9);assert.equal(pack.cases.length,3);
  const comparison=JSON.parse(await readFile(`${out}/comparison.json`,'utf8'));
  assert.deepEqual(comparison.baseline.outfits.map(o=>o.itemIds),comparison.improved.outfits.map(o=>o.itemIds));
  assert.ok(!(await readFile(`${out}/wardrobe-demo.html`,'utf8')).includes('>__CAPTURED_PACK__<'));
  console.log('PASS: capture builder contract, 9 photos, 3 replay cases, same baseline candidates, embedded HTML. Fake gateway only, not real GPU evidence.');
}finally{await new Promise(r=>server.close(r))}
