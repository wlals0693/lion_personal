import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { initialState } from '../lib/seed';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isOutfitEvaluation } from '../lib/outfit-evaluation';
export async function verifyOutfitDemo(page: Page, request: APIRequestContext) {
  const catalogResponse = await request.get('/api/demo/garments');
  expect(catalogResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  expect(catalog.providedCount).toBe(60);
  expect(catalog.supplementCount).toBe(8);
  expect(catalog.items).toHaveLength(68);
  const manifest = JSON.parse(
    await readFile(
      path.join(
        process.env.WARDROBE_MODEL_ROOT || path.resolve('../wardrobe-desktop-handoff'),
        'data/fresh_01/manifest.json',
      ),
      'utf8',
    ),
  );
  const photos = await Promise.all(
    manifest.map(async (photo: { id: string; sha256: string }) => {
      const response = await request.get(`/api/demo/photos/${photo.id}`);
      expect(response.status()).toBe(200);
      expect(
        createHash('sha256')
          .update(await response.body())
          .digest('hex'),
      ).toBe(photo.sha256);
      return photo.id;
    }),
  );
  expect(photos).toHaveLength(60);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo/outfits', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '이 옷들, 함께 입으면 어떨까요?' })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('ai-wardrobe-prototype:v1'));
  await expect(page.getByTestId('ai-outfit-card')).toHaveCount(6);
  await expect(page.getByTestId('demo-catalog-count')).toContainText('총 68벌');
  await page.getByText('전체 옷 68벌 보기', { exact: false }).click();
  await expect(page.getByTestId('demo-garment')).toHaveCount(68);
  await page.getByLabel('데모 옷 검색').fill('photo_059');
  await expect(page.getByTestId('demo-garment')).toHaveCount(1);
  await page.getByLabel('데모 옷 검색').fill('');
  await page.getByLabel('데모 옷 분류').selectOption('아우터');
  await expect(page.getByTestId('demo-garment')).toHaveCount(4);
  await page.getByLabel('데모 옷 분류').selectOption('전체');
  await page.getByText('전체 옷 68벌 보기', { exact: false }).click();
  const firstBatch = await page.getByTestId('ai-outfit-card').first().getAttribute('data-item-ids');
  await page.getByRole('button', { name: '다른 후보 만들기' }).click();
  expect(await page.getByTestId('ai-outfit-card').first().getAttribute('data-item-ids')).not.toBe(
    firstBatch,
  );
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/outfits/evaluate'), {
    timeout: 180000,
  });
  await page.getByRole('button', { name: 'AI로 코디 추천받기' }).click();
  const response = await pending;
  const data = await response.json();
  expect(response.status(), JSON.stringify(data)).toBe(200);
  expect(data.results).toHaveLength(6);
  for (const result of data.results) expect(isOutfitEvaluation(result.evaluation)).toBe(true);
  await expect(page.getByTestId('outfit-evaluation')).toHaveCount(6);
  await expect(page.getByTestId('outfit-timing')).toBeVisible();
  const demoSeconds = Number(await page.getByTestId('outfit-timing').getAttribute('data-seconds'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/outfit-demo-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/outfit-demo-mobile.png', fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem('ai-wardrobe-prototype:v1'))).toBe(before);
  await page.getByLabel('데모 상황').selectOption('출근·등교');
  await expect(page.getByTestId('outfit-evaluation')).toHaveCount(0);
  await page.getByLabel('고정할 옷').selectOption('provided_photo_059');
  for (const card of await page.getByTestId('ai-outfit-card').all())
    await expect(card).toHaveAttribute('data-item-ids', /provided_photo_059/);
  const state = {
    ...initialState(),
    loggedIn: true,
    onboarded: true,
    garments: catalog.items.map((g: { id: string }) => ({
      ...g,
      excluded: g.id === 'provided_photo_000',
    })),
  };
  await page.evaluate(
    (state) => localStorage.setItem('ai-wardrobe-prototype:v1', JSON.stringify(state)),
    state,
  );
  await page.goto('/outfits?anchor=provided_photo_059', { waitUntil: 'domcontentloaded' });
  const ownPending = page.waitForResponse((r) => r.url().endsWith('/api/outfits/evaluate'), {
    timeout: 180000,
  });
  await page.getByRole('button', { name: 'AI로 코디 추천받기' }).click();
  const ownResponse = await ownPending;
  const own = await ownResponse.json();
  expect(ownResponse.status(), JSON.stringify(own)).toBe(200);
  await expect(page.getByTestId('outfit-evaluation')).toHaveCount(6);
  const submitted = ownResponse.request().postDataJSON();
  for (const candidate of submitted.candidates) {
    expect(candidate.itemIds).toContain('provided_photo_059');
    expect(candidate.itemIds).not.toContain('provided_photo_000');
  }
  await page.getByRole('button', { name: '코디 좋아요', exact: true }).first().click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ai-wardrobe-prototype:v1')!).likes.length,
    ),
  ).toBe(1);
  const malformed = await request.post('/api/outfits/evaluate', {
    data: { occasion: '일상·산책', items: [], candidates: [] },
  });
  expect(malformed.status()).toBe(400);
  await page.route('**/api/outfits/evaluate', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '테스트 GPU 연결 오류' }),
    }),
  );
  await page.getByRole('button', { name: 'AI로 코디 추천받기' }).click();
  await expect(page.getByText('테스트 GPU 연결 오류')).toBeVisible();
  await expect(page.getByTestId('outfit-evaluation')).toHaveCount(0);
  await page.unroute('**/api/outfits/evaluate');
  expect(errors).toEqual([]);
  await writeFile(
    'test-results/outfit-demo-results.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        demoSeconds,
        demo: data,
        wardrobe: own,
        errors,
        catalog: {
          provided: catalog.providedCount,
          supplements: catalog.supplementCount,
          total: catalog.items.length,
          verifiedPhotos: photos.length,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      demoSeconds,
      modelSeconds: data.seconds,
      evaluated: data.results.length,
      ownEvaluated: own.results.length,
    }),
  );
}
