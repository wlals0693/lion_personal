import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { demoPhoto } from '@/lib/demo-catalog';
import { categories, garmentTypes, colors } from '@/lib/types';
import { isOutfitEvaluation, outfitOccasions } from '@/lib/outfit-evaluation';
export const runtime = 'nodejs';
export const maxDuration = 180;
const MAX_BYTES = 20 * 1024 * 1024;
export async function POST(request: Request) {
  const expected = new URL(request.url);
  expected.host = request.headers.get('host') || expected.host;
  if (request.headers.get('origin') && request.headers.get('origin') !== expected.origin)
    return Response.json({ error: '허용되지 않은 요청이에요.' }, { status: 403 });
  try {
    if (Number(request.headers.get('content-length')) > MAX_BYTES)
      throw new Error('옷 사진의 전체 용량이 너무 커요.');
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('옷 사진의 전체 용량이 너무 커요.');
    const input = JSON.parse(raw);
    if (
      !outfitOccasions.includes(input.occasion) ||
      !Array.isArray(input.items) ||
      input.items.length < 2 ||
      input.items.length > 24 ||
      !Array.isArray(input.candidates) ||
      input.candidates.length < 1 ||
      input.candidates.length > 6
    )
      throw new Error('평가할 코디 1~6개를 준비해주세요.');
    const itemMap = new Map<string, string>();
    const items = [];
    for (const item of input.items) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        !/^[\w:-]{1,240}$/.test(item.id) ||
        itemMap.has(item.id) ||
        !categories.includes(item.category) ||
        typeof item.image !== 'string'
      )
        throw new Error('의류 정보를 확인해주세요.');
      itemMap.set(item.id, item.category);
      let image: Buffer;
      const providedPhoto = /^\/api\/demo\/photos\/(photo_\d{3})$/.exec(item.image);
      if (providedPhoto) {
        if (item.id !== `provided_${providedPhoto[1]}`)
          throw new Error('자료 사진 ID를 확인해주세요.');
        image = await demoPhoto(providedPhoto[1]);
      } else if (/^\/clothes\/[\w-]+\.(jpg|png|webp)$/.test(item.image)) {
        image = await readFile(path.join(process.cwd(), 'public', item.image));
      } else {
        const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(item.image);
        if (!match) throw new Error('등록된 사진만 평가할 수 있어요.');
        image = Buffer.from(match[1], 'base64');
      }
      if (!image.length || image.length > 3 * 1024 * 1024)
        throw new Error('사진 한 장은 3MB 이하여야 해요.');
      items.push({
        id: item.id,
        image: image.toString('base64'),
        category: item.category,
        type:
          typeof item.type === 'string' && Object.hasOwn(garmentTypes, item.type)
            ? item.type
            : 'unknown',
        color: colors.includes(item.color) ? item.color : '잘 모르겠어요',
        reviewed: item.reviewed === true,
      });
    }
    const seen = new Set<string>();
    const seenSets = new Set<string>();
    for (const candidate of input.candidates) {
      if (
        !candidate ||
        typeof candidate.id !== 'string' ||
        candidate.id.length > 1000 ||
        seen.has(candidate.id) ||
        !Array.isArray(candidate.itemIds) ||
        candidate.itemIds.length < 2 ||
        candidate.itemIds.length > 4 ||
        !candidate.itemIds.every((id: unknown) => typeof id === 'string' && itemMap.has(id)) ||
        new Set(candidate.itemIds).size !== candidate.itemIds.length
      )
        throw new Error('코디 구성을 확인해주세요.');
      const slots = candidate.itemIds.map((id: string) => itemMap.get(id));
      if (
        new Set(slots).size !== slots.length ||
        !slots.includes('신발') ||
        !(slots.includes('원피스')
          ? !slots.includes('상의') && !slots.includes('하의')
          : slots.includes('상의') && slots.includes('하의'))
      )
        throw new Error('상의·하의·신발 또는 원피스·신발로 구성해주세요.');
      const key = [...candidate.itemIds].sort().join('|');
      if (seenSets.has(key)) throw new Error('중복된 코디예요.');
      seenSets.add(key);
      seen.add(candidate.id);
    }
    let response: Response;
    try {
      response = await fetch(
        `${process.env.WARDROBE_GPU_URL || 'http://127.0.0.1:8092'}/outfits/evaluate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol:
              ['outfit-v2-evidence', 'outfit-v3-sources'].includes(input.protocol)
                ? input.protocol : 'outfit-v1-contact-sheet',
            occasion: input.occasion,
            items,
            candidates: input.candidates,
          }),
          signal: AbortSignal.timeout(170_000),
          cache: 'no-store',
        },
      );
    } catch {
      return Response.json(
        { error: '로컬 GPU 서버에 연결하지 못했어요. GPU 서버를 실행한 후 다시 시도해주세요.' },
        { status: 503 },
      );
    }
    const result = await response.json();
    if (!response.ok)
      return Response.json(
        { error: result.error || '코디 평가에 실패했어요.' },
        { status: response.status },
      );
    if (
      !Array.isArray(result.results) ||
      result.results.length !== seen.size ||
      new Set(result.results.map((r: { id: string }) => r.id)).size !== seen.size ||
      !result.results.every(
        (r: { id: string; evaluation: unknown }) =>
          seen.has(r.id) && isOutfitEvaluation(r.evaluation) &&
          (input.protocol !== 'outfit-v3-sources' ||
            (r.evaluation as { protocol?: string }).protocol === 'outfit-v3-sources'),
      )
    )
      return Response.json(
        { error: '모델 평가 응답이 불완전해요. 다시 시도해주세요.' },
        { status: 502 },
      );
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '코디 요청을 확인해주세요.' },
      { status: 400 },
    );
  }
}
