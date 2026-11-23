/** Real GPU capture only. No fixture results, no fake-success fallback. */
import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { presentationHtml } from './presentation-template.mjs';
import { categoryForType, type Garment, type Outfit } from '../lib/types';
import { isPhotoAnalysis } from '../lib/garment-analysis';
import { outfitCandidates, isOutfitEvaluation, rankEvaluated } from '../lib/outfit-evaluation';

const arg = (name: string, fallback?: string) => {
  const n = process.argv.indexOf(name);
  return n < 0 ? fallback : process.argv[n + 1];
};
const photos = arg('--photos', process.env.WARDROBE_DEMO_PHOTOS);
if (!photos)
  throw new Error('사진 경로 필요: npm run capture:presentation -- --photos "C:\\...\\demo_today"');
const base = arg('--url', process.env.WARDROBE_WEB_URL || 'http://127.0.0.1:3000')!;
const out = arg('--out', 'presentation-output/' + new Date().toISOString().replace(/[:.]/g, '-'))!;
try {
  await access(out);
  throw new Error('기존 폴더를 덮어쓰지 않아요. 새 --out 경로를 선택해주세요.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
async function json(url: string, init?: RequestInit) {
  const response = await fetch(base + url, { ...init, signal: AbortSignal.timeout(180_000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || value.message || `HTTP ${response.status}`);
  return value;
}
if (!(await json('/api/gpu/health')).ready) throw new Error('실제 GPU가 준비되지 않았어요.');
const items: (Garment & { analysis: unknown; sha256: string })[] = [];
for (const [folder, fallback] of [
  ['top', '상의'],
  ['bottom', '하의'],
  ['shoes', '신발'],
] as const) {
  let directory = path.join(photos, folder);
  if (folder === 'shoes') {
    try {
      await access(directory);
    } catch {
      directory = path.join(photos, 'shoe');
    }
  }
  const names = (await readdir(directory)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
  for (const name of names) {
    if (items.length >= 30) throw new Error('사진은 최대 30장까지예요.');
    const raw = await readFile(path.join(directory, name));
    if (raw.length > 3 * 1024 * 1024)
      throw new Error('코디 분석용 사진은 3MB 이하로 준비해주세요.');
    const mime = /\.png$/i.test(name)
      ? 'image/png'
      : /\.webp$/i.test(name)
        ? 'image/webp'
        : 'image/jpeg';
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(raw)], { type: mime }), 'photo');
    console.log(`실제 사진 분석 ${items.length + 1}: ${folder}`);
    const a = await json('/api/garments/analyze', { method: 'POST', body: form });
    if (!isPhotoAnalysis(a)) throw new Error('분석 응답이 불완전해요.');
    items.push({
      id: `presentation_${items.length + 1}`,
      ...a,
      analysis: a,
      category: categoryForType(a.type, fallback),
      image: `data:${mime};base64,${raw.toString('base64')}`,
      source: 'upload',
      createdAt: new Date().toISOString(),
      excluded: false,
      reviewed: false,
      sha256: createHash('sha256').update(raw).digest('hex'),
    });
  }
}
if (
  !items.some((g) => g.category === '상의') ||
  !items.some((g) => g.category === '하의') ||
  !items.some((g) => g.category === '신발')
)
  throw new Error(
    '분석 결과에 상의·하의·신발이 모두 있는지 확인해주세요. 잘못 분류된 사진은 실제 웹에서 먼저 검토해주세요.',
  );
async function evaluate(occasion: string, anchor: string | undefined, protocol: string) {
  const candidates = outfitCandidates(items, occasion, anchor);
  const used = new Set(candidates.flatMap((o) => o.itemIds));
  const start = performance.now();
  const value = await json('/api/outfits/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol,
      occasion,
      candidates,
      items: items.filter((g) => used.has(g.id)),
    }),
  });
  if (value.protocol !== protocol)
    throw new Error(`프로토콜 불일치: ${protocol}. GPU 서버를 최신 코드로 재시작해주세요.`);
  const outfits: Outfit[] = candidates.map((c) => {
    const rows = value.results.filter((r: { id: string }) => r.id === c.id);
    if (rows.length !== 1 || !isOutfitEvaluation(rows[0].evaluation))
      throw new Error('코디 응답이 누락됐어요.');
    return { ...c, evaluation: rows[0].evaluation };
  });
  return {
    occasion,
    anchor: anchor || null,
    seconds: Number(((performance.now() - start) / 1000).toFixed(2)),
    outfits: rankEvaluated(outfits),
  };
}
console.log('기존판 비교 기준 6개를 실제 평가합니다.');
const baseline = await evaluate('일상·산책', undefined, 'outfit-v1-contact-sheet');
const cases = [];
for (const occasion of ['일상·산책', '약속·데이트']) {
  console.log(`개선판 실제 코디 평가: ${occasion}`);
  cases.push({ label: occasion, ...(await evaluate(occasion, undefined, 'outfit-v2-evidence')) });
}
const anchor = items.find((i) => i.category === '상의')!;
cases.push({
  label: `${anchor.name} 고정 · 일상`,
  ...(await evaluate('일상·산책', anchor.id, 'outfit-v2-evidence')),
});
const pack = {
  version: 1,
  id: randomUUID(),
  mode: 'gpu-capture',
  capturedAt: new Date().toISOString(),
  model: 'Qwen3-VL-4B Q4_K_M',
  protocol: 'outfit-v2-evidence',
  items,
  cases,
};
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'presentation.json'), JSON.stringify(pack));
await writeFile(path.join(out, 'wardrobe-demo.html'), await presentationHtml(pack));
await writeFile(
  path.join(out, 'comparison.json'),
  JSON.stringify(
    {
      sameCandidates: true,
      baseline,
      improved: cases[0],
      warning: '실행 결과입니다. 사람 평가 없이 품질 개선으로 해석하지 마세요.',
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(out, 'README.txt'),
  'wardrobe-demo.html을 노트북으로 옮겨 더블클릭하세요. 인터넷·GPU·npm 없이 사전 분석 결과를 재생합니다. 사진이 포함돼 있으니 공개 저장소에 올리지 마세요. comparison.json은 동일 후보의 기존판/개선판 실제 결과입니다.',
);
console.log(
  `완료: ${path.resolve(out, 'wardrobe-demo.html')}\n이 HTML 한 파일을 노트북에 옮기세요. 실제 모델 정확도 개선 여부는 comparison.json을 사람이 검토해야 합니다.`,
);
