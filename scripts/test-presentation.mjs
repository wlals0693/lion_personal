// Test fixture only. This never creates or claims real GPU results for the presentation.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const items=[];
for(const [slot,name,category] of [['top','t001','상의'],['bottom','b001','하의'],['shoes','s001','신발']]) {
  const raw=await readFile(`test-results/demo_today_ready/${slot}/${name}.jpg`);
  items.push({id:name,category,image:'data:image/jpeg;base64,'+raw.toString('base64'),analysis:{name:`TEST ${category}`,color:'차콜',type:slot==='top'?'t_shirt':slot==='bottom'?'trousers':'sneakers',sleeve:'short',pattern:'무지'}});
}
const evaluation={visual:'ordinary',context:'suitable',decision:'recommend',reasons:[{aspect:'overall',observation:'테스트 응답입니다. 실제 GPU 결과가 아닙니다.'}],contextReason:'테스트',limitations:['TEST FIXTURE']};
const good={id:'test',itemIds:items.map(i=>i.id),evaluation};
const held={...good,id:'held',evaluation:{...evaluation,decision:'hold',visual:'review'}};
const pack={version:1,id:'test-'+Date.now(),mode:'gpu-capture',model:'TEST FIXTURE — NOT GPU',protocol:'TEST ONLY',capturedAt:'TEST',items,cases:[{label:'일상·산책',seconds:0,outfits:[good,held]}]};
await mkdir('test-results',{recursive:true});
const html=(await readFile('presentation/index.html','utf8')).replace('__CAPTURED_PACK__',()=>JSON.stringify(pack).replace(/</g,'\\u003c'));
const filename=path.resolve('test-results/presentation-test-fixture.html');await writeFile(filename,html);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[],remote=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url())});
  await page.goto(pathToFileURL(filename).href);
  await expect(page.getByText('GPU 사전 분석 결과 재생')).toBeVisible();
  await page.getByRole('button',{name:'첫 옷 등록하기'}).click();
  for(let i=0;i<3;i++) {
    await page.getByRole('button',{name:'분석 결과 확인',exact:true}).first().click();
    if(i>0)await expect(page.locator('dialog dt').filter({hasText:'소매'})).toHaveCount(0);
    await page.getByRole('button',{name:'내 옷장에 저장'}).click();
  }
  await page.locator('nav').getByRole('button',{name:'코디',exact:true}).click();
  await expect(page.getByRole('button',{name:'이 코디 자세히 보기'})).toHaveCount(1);
  await page.getByRole('button',{name:'이 코디 자세히 보기'}).click();
  await page.getByRole('button',{name:'오늘 입을래요'}).click();
  await expect(page.getByText('입을 예정',{exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'착용 기록',exact:true}).click();
  await expect(page.getByText('입을 예정',{exact:true})).toBeVisible();
  await page.locator('nav').getByRole('button',{name:'HOME',exact:true}).click();
  await page.screenshot({path:'test-results/presentation-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.screenshot({path:'test-results/presentation-mobile.png',fullPage:true});
  if(errors.length||remote.length)throw Error(JSON.stringify({errors,remote}));
  console.log('PASS: offline file:// registration, sleeve visibility, recommendation selection, planned record, reload, desktop/mobile. TEST FIXTURE; no GPU quality verification.');
}finally{await browser.close()}
