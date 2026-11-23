// Frontend integration ONLY: API responses are fixtures. Does not measure real GPU quality.
import { chromium, expect } from '@playwright/test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.WARDROBE_WEB_URL || 'http://127.0.0.1:3012';
const photos = process.env.WARDROBE_DEMO_PHOTOS || 'test-results/demo_today_ready';
const realGpu = process.argv.includes('--gpu');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(realGpu ? 120_000 : 30_000);
  const mode = realGpu ? 'real GPU API; no fixtures' : 'API fixtures; no GPU inference';
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let slot = 'top'; let requests = 0;
  if (!realGpu) await page.route('**/api/garments/analyze', route => {
    requests++;
    return route.fulfill({ json: { type: slot === 'top' ? 't_shirt' : slot === 'bottom' ? 'trousers' : 'sneakers', sleeve: slot === 'top' ? 'short' : 'unknown', name: `테스트 ${slot} ${requests}`, color: '블랙', style: '캐주얼', pattern: '무지', neckline: '', materialGuess: '', uncertainFields: [], inferenceMs: 10 } });
  });
  if (!realGpu) await page.route('**/api/outfits/evaluate', async route => {
    const body = route.request().postDataJSON();
    if (body.items.length < 3 || body.candidates.length === 0) throw new Error('Missing real wardrobe payload');
    await route.fulfill({ json: { seconds: 0.01, results: body.candidates.map(c => ({ id: c.id, evaluation: { visual: 'cohesive', context: 'suitable', reasons: [{ aspect: 'overall', observation: '테스트 응답으로 흐름만 검증합니다.' }], contextReason: '상황 응답 테스트', limitations: ['실제 GPU 판단이 아닙니다.'] } })) } });
  });
  await page.goto(`${base}/demo/start`);
  if (realGpu) {
    const response = await page.request.get(`${base}/api/gpu/health`);
    if (!response.ok() || !(await response.json()).ready) throw new Error('GPU gateway is not ready');
  }
  await page.getByRole('link', { name: '체험 로그인부터 시작' }).click();
  await page.getByRole('button', { name: '가입 없이 데모 체험' }).click();
  await page.getByRole('button', { name: '나중에 설정하기' }).click();
  await page.getByRole('button', { name: '내 옷 사진으로 시작' }).click();
  for (const [folder, currentSlot] of [['top','top'], ['bottom','bottom'], ['shoes','shoes']]) {
    slot = currentSlot;
    const names = (await readdir(path.join(photos, folder))).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    for (const name of names) {
      await page.goto(`${base}/wardrobe/new`);
      await page.getByLabel('의류 사진 선택').setInputFiles(path.join(photos, folder, name));
      await page.getByRole('heading', { name: '이렇게 등록할까요?' }).waitFor();
      await expect(page.getByLabel('소매', { exact: true })).toHaveCount(slot === 'top' ? 1 : 0);
      await page.getByRole('button', { name: '내 옷장에 저장' }).click();
      await expect(page).toHaveURL(/\/wardrobe\/garment/);
      await expect(page.getByRole('link', { name: '다른 옷 등록하기', exact: true })).toBeVisible();
    }
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ai-wardrobe-prototype:v1')).garments.length)).toBe(9);
  await page.getByRole('link', { name: '이 옷으로 코디 추천' }).click();
  await page.getByRole('button', { name: 'AI로 코디 추천받기' }).click();
  const cards = page.getByTestId('ai-outfit-card'); await expect(cards.first()).toBeVisible();
  await cards.first().getByRole('link', { name: '코디 자세히 보기' }).click();
  await expect(page).toHaveURL(/\/outfits\/detail/);
  await expect(page.getByTestId('outfit-evaluation')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('outfit-evaluation')).toBeVisible();
  await page.getByRole('button', { name: '오늘 입을래요' }).click();
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await page.goto(base);
  await expect(page.getByText('내 옷 사진으로 AI가 평가한 코디')).toBeVisible();
  await expect(page.getByText('입을 예정', { exact: true })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-wardrobe-prototype:v1')));
  if (state.records.length !== 1 || state.records[0].status !== 'planned') throw new Error('Wear intent was not preserved');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/service-home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  await page.screenshot({ path: 'test-results/service-home-mobile.png', fullPage: true });
  const editedId = state.evaluatedOutfits[0].itemIds[0];
  await page.goto(`${base}/wardrobe/${editedId}/edit`);
  await page.getByLabel('옷 이름', { exact: true }).fill('편집 후 평가 무효화 검사');
  await page.getByRole('button', { name: '수정한 정보 저장' }).click();
  await expect.poll(() => page.evaluate(id => {
    const s = JSON.parse(localStorage.getItem('ai-wardrobe-prototype:v1'));
    return (s.evaluatedOutfits || []).some(o => o.itemIds.includes(id));
  }, editedId)).toBe(false);
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`test-results/service-flow${realGpu ? '-gpu' : ''}.json`, JSON.stringify({ mode, photos: 9, registrations: realGpu ? state.garments.length : requests, evaluatedOutfits: state.evaluatedOutfits.length, plannedRecords: state.records.length, pageErrors: errors }, null, 2));
  console.log(`PASS: login → 9 photo registrations → anchored evaluation → detail/reload → planned record → HOME. Mode: ${mode}`);
} finally { await browser.close(); }
