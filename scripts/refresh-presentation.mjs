import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { presentationHtml } from './presentation-template.mjs';
const index = process.argv.indexOf('--input');
let input = index >= 0 ? process.argv[index + 1] : undefined;
if (!input) {
  const candidates = [];
  const directories = await readdir('presentation-output', { withFileTypes: true }).catch(
    (error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  for (const d of directories) {
    if (!d.isDirectory()) continue;
    const f = path.join('presentation-output', d.name, 'presentation.json');
    try {
      candidates.push({ f, time: (await stat(f)).mtimeMs });
    } catch {}
  }
  candidates.sort((a, b) => b.time - a.time);
  input = candidates[0]?.f;
}
if (!input)
  throw Error(
    '기존 분석 파일을 찾지 못했어요. npm run refresh:presentation -- --input "기존 HTML 또는 presentation.json 경로"',
  );
const raw = await readFile(input, 'utf8');
const json = /\.html?$/i.test(input)
  ? /<script\b(?=[^>]*\bid=["']pack["'])[^>]*>([\s\S]*?)<\/script>/i.exec(raw)?.[1]
  : raw;
if (!json) throw Error('기존 HTML에서 분석 결과를 찾지 못했어요.');
const pack = JSON.parse(json);
if (pack.version !== 1 || pack.mode !== 'gpu-capture' || !pack.items?.length || !pack.cases?.length)
  throw Error('기존 GPU 결과 파일이 아니에요.');
const target = path.join(path.dirname(input), `wardrobe-demo-flow-${Date.now()}.html`);
await writeFile(target, await presentationHtml(pack));
console.log(
  `화면만 갱신했습니다. GPU 재실행 없음. 기존 파일 보존.\n새 발표 파일: ${path.resolve(target)}`,
);
