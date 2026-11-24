import type { Garment, Outfit, OutfitEvaluation } from './types';
import knowledge from '../scripts/outfit_knowledge.json';

function validGrounding(v: Record<string, unknown>): boolean {
  if (v.protocol !== 'outfit-v3-sources') return true;
  if (v.knowledgeVersion !== knowledge.version ||
      !['recommend','hold','reject'].includes(String(v.decision)) ||
      !['linked','insufficient'].includes(String(v.groundingStatus)) ||
      !Array.isArray(v.observations) || !Array.isArray(v.reasons)) return false;
  const facts = v.observations as { id: string; itemId: string; aspect: string; fact: string }[];
  if (facts.length > 12 || new Set(facts.map(f => f?.id)).size !== facts.length || facts.some(f =>
    !f || typeof f.id !== 'string' || typeof f.itemId !== 'string' ||
    !['color','pattern','texture','shape'].includes(f.aspect) || typeof f.fact !== 'string' || !f.fact.trim() || f.fact.length > 100)) return false;
  const reasons = v.reasons as OutfitEvaluation['reasons'];
  const linked = reasons.filter(r => r?.criterionId);
  if (v.groundingStatus === 'insufficient') return v.decision === 'hold' && linked.length === 0;
  return linked.length === reasons.length && linked.length > 0 && linked.every(r => {
    const criterion = knowledge.criteria.find(c => c.id === r.criterionId);
    const refs = r.evidenceIds;
    if (!criterion || r.principle !== criterion.principle || !refs || refs.length < 2 || refs.length > 6 ||
      new Set(refs).size !== refs.length || !['support','conflict','uncertain'].includes(String(r.effect)) ||
      !r.itemIds || new Set(r.itemIds).size < 2 || !r.sources || r.sources.length !== criterion.sourceIds.length) return false;
    const evidence = refs.map(id => facts.find(f => f.id === id));
    if (evidence.some(f => !f || !criterion.aspects.includes(f.aspect))) return false;
    const itemIds = new Set(evidence.map(f => f!.itemId));
    return itemIds.size === r.itemIds.length && r.itemIds.every(id => itemIds.has(id)) &&
      r.sources.every((s, i) => {
        const known = knowledge.sources.find(k => k.id === criterion.sourceIds[i]);
        return known && s.id === known.id && s.url === known.url && s.title === known.title && s.locator === known.locator;
      }) && (v.decision !== 'recommend' || r.effect === 'support');
  });
}
export const visualLabels = { cohesive: '조화로움', ordinary: '무난함', review: '확인 필요' };
export const contextLabels = {
  suitable: '상황에 적합',
  uncertain: '상황 확인 필요',
  unsuitable: '상황에 부적합',
};
export const aspectLabels = {
  color: '색상',
  pattern: '패턴',
  texture: '질감·추정',
  shape: '형태·추정',
  overall: '전체 조화',
};
export const outfitOccasions = ['일상·산책', '출근·등교', '약속·데이트', '여행·나들이'];
export function recommendationDecision(value: OutfitEvaluation): 'recommend' | 'hold' | 'reject' {
  if (value.context === 'unsuitable' || value.decision === 'reject') return 'reject';
  if (value.visual === 'review' || value.context === 'uncertain' || value.decision === 'hold')
    return 'hold';
  return 'recommend';
}

// Diversity only: no color equality or embedding similarity is treated as compatibility.
export function outfitCandidates(
  items: Garment[],
  occasion: string,
  anchor?: string,
  offset = 0,
): Outfit[] {
  const active = items.filter((g) => !g.excluded);
  const fixed = anchor ? active.find((g) => g.id === anchor) : undefined;
  if (anchor && !fixed) return [];
  const slot = (category: Garment['category']) =>
    fixed?.category === category ? [fixed] : active.filter((g) => g.category === category);
  const bases: Garment[][][] = [];
  if (fixed?.category !== '원피스') bases.push([slot('상의'), slot('하의'), slot('신발')]);
  if (!fixed || ['원피스', '신발', '아우터'].includes(fixed.category))
    bases.push([slot('원피스'), slot('신발')]);
  const groups: Garment[][][] = [];
  for (const base of bases) {
    if (base.some((s) => !s.length)) continue;
    if (fixed?.category === '아우터') groups.push([...base, [fixed]]);
    else {
      groups.push(base);
      const outer = slot('아우터');
      if (outer.length) groups.push([...base, outer]);
    }
  }
  if (!groups.length) return [];
  const chosen: Outfit[] = [];
  const seen = new Set<string>();
  const start = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0);
  // Lazy mixed-radix traversal: all wardrobes remain reachable, without a 120-prefix cutoff.
  // Rotate later slots with earlier digits to vary shoes/bottoms as well as tops.
  for (let n = start; n < start + groups.length * 6 && chosen.length < 6; n++) {
    const group = groups[n % groups.length];
    let cursor = Math.floor(n / groups.length);
    let rotation = 0;
    const parts = group.map((slot) => {
      const digit = cursor % slot.length;
      cursor = Math.floor(cursor / slot.length);
      const item = slot[(digit + rotation) % slot.length];
      rotation += digit;
      return item;
    });
    const ids = parts.map((g) => g.id);
    const key = [...ids].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push({
      id: 'outfit:' + ids.join(':'),
      itemIds: ids,
      occasion,
      title: '내 옷으로 만든 코디',
    });
  }
  return chosen;
}
export function isOutfitEvaluation(value: unknown): value is OutfitEvaluation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const shortText = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 300;
  return (
    validGrounding(v) &&
    (v.protocol !== 'outfit-v2-evidence' ||
      (['recommend', 'hold', 'reject'].includes(String(v.decision)) &&
        Array.isArray(v.reasons) &&
        v.reasons.every(
          (r) =>
            r &&
            (!r.evidence || shortText(r.evidence)) &&
            (!r.itemIds ||
              (Array.isArray(r.itemIds) &&
                r.itemIds.length >= 2 &&
                r.itemIds.every((id: unknown) => typeof id === 'string'))),
        ))) &&
    typeof v.visual === 'string' &&
    Object.hasOwn(visualLabels, v.visual) &&
    typeof v.context === 'string' &&
    Object.hasOwn(contextLabels, v.context) &&
    shortText(v.contextReason) &&
    Array.isArray(v.reasons) &&
    v.reasons.length > 0 &&
    v.reasons.length <= 5 &&
    v.reasons.every(
      (r) =>
        r &&
        typeof r.aspect === 'string' &&
        Object.hasOwn(aspectLabels, r.aspect) &&
        shortText(r.observation),
    ) &&
    Array.isArray(v.limitations) &&
    v.limitations.length > 0 &&
    v.limitations.length <= 5 &&
    v.limitations.every(shortText)
  );
}
export function rankEvaluated(outfits: Outfit[]): Outfit[] {
  const rank = { cohesive: 0, ordinary: 1, review: 2 };
  return [...outfits].sort((a, b) => {
    if (!a.evaluation || !b.evaluation) throw new Error('Missing evaluation');
    return (
      Number(a.evaluation.context === 'unsuitable') -
        Number(b.evaluation.context === 'unsuitable') ||
      rank[a.evaluation.visual] - rank[b.evaluation.visual]
    );
  });
}
export async function evaluateOutfits(
  items: Garment[],
  candidates: Outfit[],
  occasion: string,
  signal?: AbortSignal,
): Promise<{ outfits: Outfit[]; seconds: number }> {
  const ids = new Set(candidates.flatMap((o) => o.itemIds));
  const response = await fetch('/api/outfits/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'outfit-v3-sources',
      occasion,
      candidates: candidates.map((o) => ({ id: o.id, itemIds: o.itemIds })),
      items: items
        .filter((g) => ids.has(g.id))
        .map((g) => ({
          id: g.id,
          category: g.category,
          image: g.image,
          type: g.type,
          color: g.color,
          reviewed: g.reviewed === true,
        })),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(180_000)])
      : AbortSignal.timeout(180_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '코디 평가를 완료하지 못했어요.');
  if (!Array.isArray(data.results) || data.results.length !== candidates.length)
    throw new Error('코디 응답이 누락됐어요.');
  const evaluated = candidates.map((candidate) => {
    const matches = data.results.filter((r: { id: string }) => r.id === candidate.id);
    if (matches.length !== 1 || !isOutfitEvaluation(matches[0].evaluation) ||
      matches[0].evaluation.protocol !== 'outfit-v3-sources' ||
      matches[0].evaluation.observations?.some((f: { itemId: string }) => !candidate.itemIds.includes(f.itemId)))
      throw new Error('코디 응답을 확인하지 못했어요.');
    return { ...candidate, evaluation: matches[0].evaluation };
  });
  return { outfits: rankEvaluated(evaluated), seconds: data.seconds };
}
