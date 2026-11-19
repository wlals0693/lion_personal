import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { initialState } from '../lib/seed';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const modelRoot = process.env.WARDROBE_MODEL_ROOT || path.resolve('../wardrobe-desktop-handoff');
export async function verifyGpuRegistration(page: Page, request: APIRequestContext) {
  const state = { ...initialState(), loggedIn: true, onboarded: true, garments: [] };
  await page.addInitScript((state) => {
    if (!localStorage.getItem('ai-wardrobe-prototype:v1'))
      localStorage.setItem('ai-wardrobe-prototype:v1', JSON.stringify(state));
  }, state);
  const manifest = JSON.parse(
    await readFile(path.join(modelRoot, 'data/fresh_01/manifest.json'), 'utf8'),
  );
  const measured = [];
  for (const id of ['photo_000', 'photo_005', 'photo_020', 'photo_028', 'photo_042']) {
    console.log('Uploading', id);
    const photo = manifest.find((row: { id: string }) => row.id === id);
    await page.goto('/wardrobe/new', { waitUntil: 'domcontentloaded' });
    console.log('Registration page loaded');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /사진을 올려주세요/ }).click(),
    ]);
    console.log('File chooser opened');
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/garments/analyze') && response.request().method() === 'POST',
    );
    await chooser.setFiles(path.join(modelRoot, photo.path));
    console.log('File selected');
    const timing = page.getByTestId('analysis-timing');
    await expect(timing).toBeVisible({ timeout: 95_000 });
    const prediction = await (await responsePromise).json();
    for (const [label, key] of [
      ['옷 이름', 'name'],
      ['주 색상', 'color'],
      ['스타일', 'style'],
      ['패턴', 'pattern'],
      ['목 형태', 'neckline'],
      ['원단 추정', 'materialGuess'],
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(prediction[key]);
    }
    const kind = await page.getByLabel('옷 종류', { exact: true }).inputValue();
    const sleeve = await page.getByLabel('소매', { exact: true }).inputValue();
    expect(kind).not.toBe('unknown');
    expect(sleeve).not.toBe('unknown');
    if (id === 'photo_000') {
      expect(kind).toBe('shirt');
      expect(sleeve).toBe('short');
    }
    const measures = await timing.evaluate((el) => ({
      totalMs: Number(el.getAttribute('data-total-ms')),
      afterSelectionMs: Number(el.getAttribute('data-selection-ms')),
      inferenceMs: Number(el.getAttribute('data-inference-ms')),
    }));
    measured.push({
      id,
      kind,
      sleeve,
      name: prediction.name,
      color: prediction.color,
      style: prediction.style,
      pattern: prediction.pattern,
      neckline: prediction.neckline,
      materialGuess: prediction.materialGuess,
      uncertainFields: prediction.uncertainFields,
      ...measures,
    });
    console.log(JSON.stringify(measured.at(-1)));
    if (id === 'photo_000') {
      await page.screenshot({ path: 'test-results/gpu-registration-desktop.png', fullPage: true });
      await page.getByLabel('소매', { exact: true }).selectOption('long');
      await page.getByLabel('주 색상', { exact: true }).selectOption('퍼플');
      await page.getByLabel('패턴', { exact: true }).fill('직접 확인한 무지');
      await page.getByLabel('원단 추정', { exact: true }).fill('라벨 별도 확인 예정');
      await page.getByRole('button', { name: '내 옷장에 저장' }).click();
      await expect(page.getByRole('heading', { name: '내 옷 자세히 보기' })).toBeVisible();
      await page.reload();
      await expect(page.getByText('긴팔', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: '수정', exact: true }).click();
      await expect(page.getByLabel('옷 종류', { exact: true })).toHaveValue('shirt');
      await expect(page.getByLabel('소매', { exact: true })).toHaveValue('long');
      await expect(page.getByLabel('주 색상', { exact: true })).toHaveValue('퍼플');
      await expect(page.getByLabel('패턴', { exact: true })).toHaveValue('직접 확인한 무지');
      await expect(page.getByLabel('목 형태', { exact: true })).toHaveValue(prediction.neckline);
      await expect(page.getByLabel('스타일', { exact: true })).toHaveValue(prediction.style);
      await expect(page.getByLabel('원단 추정', { exact: true })).toHaveValue(
        '라벨 별도 확인 예정',
      );
    }
  }
  // Real API rejects unsupported input instead of returning a made-up prediction.
  const bad = await request.post('/api/garments/analyze', {
    multipart: { photo: { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') } },
  });
  expect(bad.status()).toBe(400);
  const corrupt = await request.post('/api/garments/analyze', {
    multipart: {
      photo: { name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') },
    },
  });
  expect(corrupt.status()).toBe(422);
  await page.goto('/wardrobe/new');
  await page.route('**/api/garments/analyze', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'GPU 연결 테스트 오류' }),
    }),
  );
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /사진을 올려주세요/ }).click(),
  ]);
  await chooser.setFiles(path.join(modelRoot, manifest[0].path));
  await expect(page.getByText('GPU 연결 테스트 오류')).toBeVisible();
  await expect(page.getByLabel('옷 종류', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/garments/analyze');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByLabel('옷 종류', { exact: true })).toHaveValue('shirt', {
    timeout: 95_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('소매', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/gpu-registration-mobile.png', fullPage: true });
  // Unclear results must clear previous photo attributes, while a user-written name survives.
  await page.getByLabel('옷 이름', { exact: true }).fill('내가 정한 옷 이름');
  await page.route('**/api/garments/analyze', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'unknown',
        sleeve: 'unknown',
        name: '확인 필요한 옷',
        color: '잘 모르겠어요',
        style: '잘 모르겠어요',
        pattern: '',
        neckline: '',
        materialGuess: '',
        uncertainFields: ['color', 'style', 'pattern', 'neckline', 'materialGuess'],
        inferenceMs: 1,
      }),
    }),
  );
  const [replacement] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '사진 바꾸기' }).click(),
  ]);
  await replacement.setFiles(path.join(modelRoot, manifest[0].path));
  await expect(page.getByLabel('주 색상', { exact: true })).toHaveValue('잘 모르겠어요');
  await expect(page.getByLabel('스타일', { exact: true })).toHaveValue('잘 모르겠어요');
  await expect(page.getByLabel('패턴', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('목 형태', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('원단 추정', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('옷 이름', { exact: true })).toHaveValue('내가 정한 옷 이름');
  await expect(page.getByTestId('uncertain-fields')).toContainText('원단 추정');
  await page.unroute('**/api/garments/analyze');
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/gpu-web-timing.json',
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        browser: process.env.PLAYWRIGHT_CHANNEL || 'Chromium headless',
        mode: 'local production build',
        protocol: 'expanded registration prompt, max_tokens=384',
        method:
          'upload button click to second animation frame after populated form commit; automated file chooser',
        measurements: measured,
      },
      null,
      2,
    ),
  );
}
