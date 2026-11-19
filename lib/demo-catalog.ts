import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { categoryForType, garmentTypes, type Garment, type GarmentType } from './types';
import { sampleGarments } from './seed';

const root = path.resolve(
  process.env.WARDROBE_MODEL_ROOT || path.join(process.cwd(), '../wardrobe-desktop-handoff'),
);
interface Row {
  id: string;
  path: string;
  sha256: string;
}
interface Label {
  id: string;
  type: string;
  sleeve: string;
}
async function files() {
  const manifest: Row[] = JSON.parse(
    await readFile(path.join(root, 'data/fresh_01/manifest.json'), 'utf8'),
  );
  const data: { labels: Label[] } = JSON.parse(
    await readFile(path.join(root, 'data/fresh_01/registration_labels.json'), 'utf8'),
  );
  if (
    !Array.isArray(manifest) ||
    !manifest.length ||
    new Set(manifest.map((r) => r.id)).size !== manifest.length
  )
    throw new Error('Invalid demo manifest');
  return { manifest, labels: new Map(data.labels.map((label) => [label.id, label])) };
}
export async function demoCatalog() {
  const { manifest, labels } = await files();
  const provided: Garment[] = manifest.map((row) => {
    if (!/^photo_\d{3}$/.test(row.id) || !labels.has(row.id)) throw new Error('Invalid demo label');
    const label = labels.get(row.id)!;
    const type: GarmentType = Object.hasOwn(garmentTypes, label.type)
      ? (label.type as GarmentType)
      : 'unknown';
    return {
      id: `provided_${row.id}`,
      name: path
        .basename(row.path)
        .replace(/\.[^.]+$/, '')
        .slice(0, 60),
      category: label.type === 'outer' ? '아우터' : categoryForType(type, '상의'),
      type,
      sleeve: ['short', 'long', 'none'].includes(label.sleeve)
        ? (label.sleeve as Garment['sleeve'])
        : 'unknown',
      color: '잘 모르겠어요',
      style: '잘 모르겠어요',
      image: `/api/demo/photos/${row.id}`,
      excluded: false,
      source: 'sample',
      createdAt: '2026-11-09',
    };
  });
  const supplements = sampleGarments().filter((item) => ['하의', '신발'].includes(item.category));
  return {
    items: [...provided, ...supplements],
    providedCount: provided.length,
    supplementCount: supplements.length,
    note: '종류·소매는 기존 검토표에서 가져온 데모 정보이며 색상·스타일은 미확인입니다. 모델의 어울림 정답으로 사용하지 않습니다.',
  };
}
export async function demoPhoto(id: string) {
  if (!/^photo_\d{3}$/.test(id)) throw new Error('Unknown photo');
  const { manifest } = await files();
  const row = manifest.find((r) => r.id === id);
  if (!row) throw new Error('Unknown photo');
  const target = path.resolve(root, row.path);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid photo path');
  const bytes = await readFile(target);
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
    throw new Error('Photo hash mismatch');
  return bytes;
}
