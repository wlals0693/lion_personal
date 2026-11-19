import {
  colors,
  styles,
  garmentTypes,
  sleeveTypes,
  type GarmentType,
  type SleeveType,
} from './types';

export interface PhotoAnalysis {
  type: GarmentType;
  sleeve: SleeveType;
  name: string;
  color: string;
  style: string;
  pattern: string;
  neckline: string;
  materialGuess: string;
  uncertainFields: string[];
  inferenceMs: number;
}

export function isPhotoAnalysis(value: unknown): value is PhotoAnalysis {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === 'string' &&
    Object.hasOwn(garmentTypes, v.type) &&
    typeof v.sleeve === 'string' &&
    Object.hasOwn(sleeveTypes, v.sleeve) &&
    typeof v.name === 'string' &&
    v.name.length > 0 &&
    v.name.length <= 60 &&
    typeof v.color === 'string' &&
    colors.includes(v.color) &&
    typeof v.style === 'string' &&
    [...styles, '잘 모르겠어요'].includes(v.style) &&
    ['pattern', 'neckline', 'materialGuess'].every(
      (key) => typeof v[key] === 'string' && (v[key] as string).length <= 100,
    ) &&
    Array.isArray(v.uncertainFields) &&
    v.uncertainFields.every((field) => typeof field === 'string') &&
    typeof v.inferenceMs === 'number' &&
    Number.isFinite(v.inferenceMs) &&
    v.inferenceMs >= 0
  );
}

export async function analyzeGarment(file: File): Promise<PhotoAnalysis> {
  const form = new FormData();
  form.append('photo', file);
  const response = await fetch('/api/garments/analyze', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(95_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '사진을 분석하지 못했어요.');
  if (!isPhotoAnalysis(result)) throw new Error('분석 응답을 읽지 못했어요. 다시 시도해주세요.');
  return result;
}
