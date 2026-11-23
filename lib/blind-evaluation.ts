export type Slot = 'tops' | 'bottoms' | 'shoes';
export type Rating = 'good' | 'ordinary' | 'awkward';
export interface EvalItem {
  id: string;
  slot: Slot;
  image: string;
  sha256: string;
}
export interface EvalCandidate {
  id: string;
  itemIds: string[];
}
export interface HumanRating {
  visual: Rating | '';
  context: 'suitable' | 'uncertain' | 'unsuitable' | '';
  reason: string;
}
export interface EvaluationSet {
  version: 1;
  id: string;
  practice: boolean;
  occasion: string;
  evaluator: string;
  evaluatorRole: 'user' | 'expert' | 'other';
  items: EvalItem[];
  candidates: EvalCandidate[];
  ratings: Record<string, HumanRating>;
  lockedAt?: string;
}
export function createSet(): EvaluationSet {
  return {
    version: 1,
    id: crypto.randomUUID(),
    practice: false,
    occasion: '일상 외출',
    evaluator: '',
    evaluatorRole: 'user',
    items: [],
    candidates: [],
    ratings: {},
  };
}
// Spread a bounded batch across the Cartesian product, rather than taking its prefix.
export function makeCandidates(items: EvalItem[], limit = 24): EvalCandidate[] {
  const groups = (['tops', 'bottoms', 'shoes'] as Slot[]).map((s) =>
    items.filter((i) => i.slot === s),
  );
  const total = groups.reduce((n, g) => n * g.length, 1);
  const count = Math.min(limit, total);
  return Array.from({ length: count }, (_, index) => {
    let n = Math.floor((index * total) / count);
    const ids = [...groups]
      .reverse()
      .map((g) => {
        const item = g[n % g.length];
        n = Math.floor(n / g.length);
        return item.id;
      })
      .reverse();
    return { id: `candidate_${String(index + 1).padStart(3, '0')}`, itemIds: ids };
  });
}
export function canLock(set: EvaluationSet): boolean {
  return (
    !!set.evaluator.trim() &&
    !!set.occasion.trim() &&
    set.candidates.length > 0 &&
    set.candidates.every(
      (c) =>
        set.ratings[c.id]?.reason.trim() && set.ratings[c.id]?.visual && set.ratings[c.id]?.context,
    )
  );
}
export function parseBackup(text: string): EvaluationSet {
  const s = JSON.parse(text) as EvaluationSet;
  if (
    s?.version !== 1 ||
    typeof s.id !== 'string' ||
    typeof s.practice !== 'boolean' ||
    typeof s.occasion !== 'string' ||
    typeof s.evaluator !== 'string' ||
    !['user', 'expert', 'other'].includes(s.evaluatorRole) ||
    !Array.isArray(s.items) ||
    s.items.length > 30 ||
    !Array.isArray(s.candidates) ||
    s.candidates.length > 24 ||
    !s.ratings ||
    typeof s.ratings !== 'object'
  )
    throw new Error('올바른 평가 백업 파일이 아니에요.');
  const ids = new Set(s.items.map((i) => i.id));
  if (
    ids.size !== s.items.length ||
    s.items.some(
      (i) =>
        typeof i.id !== 'string' ||
        !['tops', 'bottoms', 'shoes'].includes(i.slot) ||
        typeof i.image !== 'string' ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(i.image) ||
        !/^[a-f0-9]{64}$/.test(i.sha256),
    )
  )
    throw new Error('사진 목록이 올바르지 않아요.');
  if (
    new Set(s.candidates.map((c) => c.id)).size !== s.candidates.length ||
    s.candidates.some(
      (c) =>
        typeof c.id !== 'string' ||
        !Array.isArray(c.itemIds) ||
        c.itemIds.length !== 3 ||
        c.itemIds.some((id) => !ids.has(id)) ||
        new Set(c.itemIds.map((id) => s.items.find((i) => i.id === id)?.slot)).size !== 3,
    )
  )
    throw new Error('코디 구성이 올바르지 않아요.');
  if (
    Object.entries(s.ratings).some(
      ([id, r]) =>
        !s.candidates.some((c) => c.id === id) ||
        !r ||
        !['', 'good', 'ordinary', 'awkward'].includes(r.visual) ||
        !['', 'suitable', 'uncertain', 'unsuitable'].includes(r.context) ||
        typeof r.reason !== 'string',
    )
  )
    throw new Error('평가 내용이 올바르지 않아요.');
  if (s.lockedAt && (typeof s.lockedAt !== 'string' || !canLock(s)))
    throw new Error('확정 평가가 완전하지 않아요.');
  return s;
}
export function experimentPayload(set: EvaluationSet) {
  if (!set.lockedAt || !canLock(set)) throw new Error('평가를 모두 작성한 뒤 확정해주세요.');
  // No human labels, original filenames, or product descriptions reach the model input.
  return {
    version: 1,
    setId: set.id,
    practice: set.practice,
    lockedAt: set.lockedAt,
    occasion: set.occasion,
    items: set.items,
    candidates: set.candidates,
  };
}
export async function sha256(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
