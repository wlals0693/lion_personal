import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleGarments } from '../lib/seed';
test('large wardrobes remain reachable beyond the old 120-combination prefix', () => {
  const seed = sampleGarments();
  const tops = Array.from({ length: 56 }, (_, i) => ({ ...seed[0], id: `provided_${i}` }));
  const outer = Array.from({ length: 4 }, (_, i) => ({
    ...seed[0],
    id: `outer_${i}`,
    category: '아우터' as const,
  }));
  const items = [...tops, ...outer, ...seed.filter((g) => ['하의', '신발'].includes(g.category))];
  const encountered = new Set<string>();
  for (let batch = 0; batch < 20; batch++) {
    const candidates = outfitCandidates(items, '일상·산책', undefined, batch * 6);
    assert.equal(candidates.length, 6);
    assert.equal(new Set(candidates.map((c) => c.id)).size, 6);
    candidates.forEach((c) => c.itemIds.forEach((id) => encountered.add(id)));
  }
  for (const garment of items) assert.ok(encountered.has(garment.id), garment.id);
  assert.ok(
    outfitCandidates(items, '일상·산책', 'provided_55').every((c) =>
      c.itemIds.includes('provided_55'),
    ),
  );
  assert.ok(
    outfitCandidates(items, '일상·산책', 'outer_3').every((c) => c.itemIds.includes('outer_3')),
  );
});
import { categoryForType, type Outfit, type OutfitEvaluation } from '../lib/types';
import { isOutfitEvaluation, outfitCandidates, rankEvaluated } from '../lib/outfit-evaluation';
import { recommendationDecision } from '../lib/outfit-evaluation';
const evaluation: OutfitEvaluation = {
  visual: 'ordinary',
  context: 'suitable',
  reasons: [{ aspect: 'overall', observation: '전체 조합을 확인합니다.' }],
  contextReason: '일상 기준입니다.',
  limitations: ['실제 착용 핏은 알 수 없습니다.'],
};
test('recommendation selection may return zero and never promotes uncertain or unsuitable cases', () => {
  assert.equal(recommendationDecision(evaluation), 'recommend');
  assert.equal(recommendationDecision({...evaluation, context:'uncertain'}), 'hold');
  assert.equal(recommendationDecision({...evaluation, context:'unsuitable'}), 'reject');
  assert.equal(recommendationDecision({...evaluation, decision:'hold'}), 'hold');
  assert.equal(recommendationDecision({...evaluation, visual:'review'}), 'hold');
});
test('candidates honor fixed/excluded garments and are complete, unique and bounded', () => {
  const items = sampleGarments().map((g) => ({ ...g, excluded: g.id === 'b005' }));
  const result = outfitCandidates(items, '일상·산책', 't003');
  assert.equal(result.length, 6);
  assert.equal(new Set(result.map((o) => [...o.itemIds].sort().join(','))).size, 6);
  for (const outfit of result) {
    assert.ok(outfit.itemIds.includes('t003'));
    assert.ok(!outfit.itemIds.includes('b005'));
    assert.equal(outfit.itemIds.length, 3);
  }
  assert.deepEqual(outfitCandidates(items, '일상·산책', 'b005'), []);
  assert.deepEqual(
    outfitCandidates(
      items.filter((g) => g.category !== '신발'),
      '일상·산책',
    ),
    [],
  );
});
test('visual ranking is ordinal, context unsuitability is separate and ties stable', () => {
  const make = (
    id: string,
    visual: OutfitEvaluation['visual'],
    context: OutfitEvaluation['context'],
  ): Outfit => ({
    id,
    itemIds: [],
    occasion: '일상·산책',
    title: id,
    evaluation: { ...evaluation, visual, context },
  });
  const result = rankEvaluated([
    make('unsuitable', 'cohesive', 'unsuitable'),
    make('ordinary', 'ordinary', 'suitable'),
    make('cohesive1', 'cohesive', 'uncertain'),
    make('cohesive2', 'cohesive', 'suitable'),
  ]);
  assert.deepEqual(
    result.map((o) => o.id),
    ['cohesive1', 'cohesive2', 'ordinary', 'unsuitable'],
  );
  assert.equal(isOutfitEvaluation({ ...evaluation, visual: 98 }), false);
  assert.equal(isOutfitEvaluation({ ...evaluation, reasons: [] }), false);
  assert.equal(isOutfitEvaluation(evaluation), true);
});
test('new bottom, footwear and dress types map to wardrobe slots without becoming tops', () => {
  assert.equal(categoryForType('jeans', '상의'), '하의');
  assert.equal(categoryForType('sneakers', '상의'), '신발');
  assert.equal(categoryForType('dress', '상의'), '원피스');
  assert.equal(categoryForType('unknown', '신발'), '신발');
});
