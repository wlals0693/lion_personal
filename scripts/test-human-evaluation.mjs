import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.WARDROBE_WEB_URL || 'http://localhost:3011'}/demo/evaluation`);
  await page.getByRole('button', { name: '예시로 연습하기' }).click();
  await page.getByText('상의 · 4장').waitFor();
  await page.getByLabel('평가자 별칭').fill('browser-test');
  await page.getByRole('button', { name: '최대 24개 코디 구성하기' }).click();
  assert.equal(await page.getByRole('button', { name: '평가 확정하고 실험 준비' }).isEnabled(), false);
  for (let i = 0; i < 24; i++) {
    await page.getByRole('button', { name: '무난', exact: true }).click();
    await page.getByLabel('상황 적합성').selectOption('suitable');
    await page.getByLabel('판단 이유 (필수)').fill('브라우저 테스트용 판단');
    if (i < 23) await page.getByRole('button', { name: '다음', exact: true }).click();
  }
  await page.getByText('브라우저에 저장됨', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('기록 24 / 24').waitFor();
  await page.getByRole('button', { name: '평가 확정하고 실험 준비' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '데탑 실험 입력 내보내기' }).click();
  const download = await downloaded;
  const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(payload.candidates.length, 24);
  assert.equal(payload.items.length, 12);
  assert.equal(payload.practice, true);
  assert.equal('ratings' in payload, false);
  await mkdir('test-results', { recursive: true });
  await download.saveAs('test-results/human-experiment.json');
  await page.screenshot({ path: 'test-results/human-evaluation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/human-evaluation-mobile.png', fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '새 평가 시작', exact: true }).click();
  for (const [label, name] of [['상의', 't001'], ['하의', 'b005'], ['신발', 's002']]) {
    await page.getByLabel(`${label} 사진 추가`).setInputFiles(`public/clothes/${name}.jpg`);
    await page.getByText(`${label} · 1장`).waitFor();
  }
  await page.getByLabel('평가자 별칭').fill('fresh-upload');
  await page.getByRole('button', { name: '최대 24개 코디 구성하기' }).click();
  await page.getByRole('button', { name: '좋음', exact: true }).click();
  await page.getByLabel('상황 적합성').selectOption('suitable');
  await page.getByLabel('판단 이유 (필수)').fill('사진 업로드 흐름 검사');
  await page.getByRole('button', { name: '평가 확정하고 실험 준비' }).click();
  await page.getByRole('heading', { name: '평가 확정 완료' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: 24 blind ratings, IndexedDB reload, locking, label-free export, mobile width, new photo upload; no page errors.');
} finally { await browser.close(); }
