import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCandidates,
  canLock,
  experimentPayload,
  parseBackup,
  type EvaluationSet,
} from '../lib/blind-evaluation';
function fixture(): EvaluationSet {
  const items = (['tops', 'bottoms', 'shoes'] as const).flatMap((slot) =>
    Array.from({ length: 5 }, (_, n) => ({
      id: `${slot}_${n}`,
      slot,
      image: 'data:image/jpeg;base64,YQ==',
      sha256: 'a'.repeat(64),
    })),
  );
  return {
    version: 1,
    id: 'set1',
    practice: false,
    occasion: '일상',
    evaluator: 'tester',
    evaluatorRole: 'user',
    items,
    candidates: makeCandidates(items),
    ratings: {},
  };
}
test('bounded candidates are unique, complete and cover every item in a 5x5x5 pilot', () => {
  const s = fixture();
  assert.equal(s.candidates.length, 24);
  assert.equal(new Set(s.candidates.map((c) => c.itemIds.join(','))).size, 24);
  assert.equal(new Set(s.candidates.flatMap((c) => c.itemIds)).size, 15);
  assert.deepEqual(makeCandidates([]), []);
});
test('unfinished human ratings cannot be exported; experiment excludes all human answers', () => {
  const s = fixture();
  assert.equal(canLock(s), false);
  assert.throws(() => experimentPayload(s));
  for (const c of s.candidates)
    s.ratings[c.id] = { visual: 'good', context: 'suitable', reason: '색 조합' };
  assert.equal(canLock(s), true);
  s.lockedAt = '2026-11-20T00:00:00Z';
  const payload = experimentPayload(s);
  assert.equal('ratings' in payload, false);
  assert.equal('evaluator' in payload, false);
  assert.equal(JSON.stringify(payload).includes('색 조합'), false);
  assert.equal(payload.candidates.length, s.candidates.length);
});
test('backups preserve evaluations but reject external images and broken item references', () => {
  const s = fixture();
  assert.deepEqual(parseBackup(JSON.stringify(s)), s);
  s.items[0].image = 'https://example.com/a.jpg';
  assert.throws(() => parseBackup(JSON.stringify(s)));
  s.items[0].image = 'data:image/jpeg;base64,YQ==';
  s.candidates[0].itemIds[0] = 'missing';
  assert.throws(() => parseBackup(JSON.stringify(s)));
});
