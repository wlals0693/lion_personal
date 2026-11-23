// Test fixture only. This never creates or claims real GPU results for the presentation.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { presentationHtml } from './presentation-template.mjs';
const items = [];
for (const [slot, name, category] of [
  ['top', 't001', '상의'],
  ['bottom', 'b001', '하의'],
  ['shoes', 's001', '신발'],
]) {
  const raw = await readFile(`test-results/demo_today_ready/${slot}/${name}.jpg`);
  items.push({
    id: name,
    category,
    image: 'data:image/jpeg;base64,' + raw.toString('base64'),
    analysis: {
      name: `TEST ${category}`,
      color: '차콜',
      type: slot === 'top' ? 't_shirt' : slot === 'bottom' ? 'trousers' : 'sneakers',
      sleeve: 'short',
      pattern: '무지',
    },
  });
}
const evaluation = {
  visual: 'ordinary',
  context: 'suitable',
  decision: 'recommend',
  reasons: [{ aspect: 'overall', observation: '테스트 응답입니다. 실제 GPU 결과가 아닙니다.' }],
  contextReason: '테스트',
  limitations: ['TEST FIXTURE'],
};
const good = { id: 'test', itemIds: items.map((i) => i.id), evaluation };
const held = {
  ...good,
  id: 'held',
  evaluation: { ...evaluation, decision: 'hold', visual: 'review' },
};
const pack = {
  version: 1,
  id: 'test-' + Date.now(),
  mode: 'gpu-capture',
  model: 'TEST FIXTURE — NOT GPU',
  protocol: 'TEST ONLY',
  capturedAt: 'TEST',
  items,
  cases: [{ label: '일상·산책', seconds: 0, outfits: [good, held] }],
};
await mkdir('test-results', { recursive: true });
const html = await presentationHtml(pack);
const filename = path.resolve('test-results/presentation-test-fixture.html');
await writeFile(filename, html);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [],
    remote = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await page.goto(pathToFileURL(filename).href);
  await expect(page.getByText('GPU 사전 분석 결과 재생')).toBeVisible();
  await page.getByRole('button', { name: '사진 등록부터 시작' }).click();
  await expect(page.locator('#flow .current')).toContainText('사진 등록');
  await page.getByRole('button', { name: /사진 선택하기/ }).click();
  await page.getByRole('button', { name: '상의 등록 사진' }).click();
  await expect(page.getByRole('heading', { name: /사진에서 찾은 특징/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/presentation-review.png', fullPage: true });
  await page.getByRole('button', { name: '내 옷장에 저장' }).click();
  await expect(page.getByText('옷장에 새 옷을 저장했어요.', { exact: false })).toBeVisible();
  await expect(page.locator('#flow .current')).toContainText('나의 옷장');
  await page.getByRole('button', { name: '준비한 나머지 2벌 불러오기' }).click();
  await page.getByRole('button', { name: '이 옷들로 코디 찾기' }).click();
  await expect(page.getByRole('button', { name: '이 코디 선택하기' })).toHaveCount(0);
  await page.getByRole('button', { name: '이 상황의 코디 확인하기' }).click();
  await expect(page.getByRole('button', { name: '이 코디 선택하기' })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/presentation-results.png', fullPage: true });
  await page.getByRole('button', { name: '이 코디 선택하기' }).click();
  await expect(page.locator('#flow .current')).toContainText('코디 선택');
  await page.getByRole('button', { name: '오늘 입을래요' }).click();
  await expect(page.locator('#flow .current')).toContainText('착용 예정 기록');
  await expect(page.getByText('입을 예정', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'HOME에서 결과 확인' }).click();
  await page.reload();
  await page.getByRole('button', { name: '착용 기록', exact: true }).click();
  await expect(page.getByText('입을 예정', { exact: true })).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'HOME', exact: true }).click();
  await page.screenshot({ path: 'test-results/presentation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error('Mobile overflow');
  await page.screenshot({ path: 'test-results/presentation-mobile.png', fullPage: true });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '사진 등록부터 시작' }).click();
  await page.getByRole('button', { name: /사진 선택하기/ }).click();
  await page.getByRole('button', { name: '하의 등록 사진' }).click();
  await expect(page.locator('main dt').filter({ hasText: '소매' })).toHaveCount(0);
  if (errors.length || remote.length) throw Error(JSON.stringify({ errors, remote }));
  console.log(
    'PASS: offline file:// registration, sleeve visibility, recommendation selection, planned record, reload, desktop/mobile. TEST FIXTURE; no GPU quality verification.',
  );
} finally {
  await browser.close();
}
