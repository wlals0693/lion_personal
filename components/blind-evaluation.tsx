'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeading, ErrorBox } from './ui';
import { sampleGarments } from '@/lib/seed';
import { readEvaluation, writeEvaluation } from '@/lib/evaluation-storage';
import {
  createSet,
  makeCandidates,
  canLock,
  experimentPayload,
  downloadJson,
  sha256,
  parseBackup,
  type EvaluationSet,
  type EvalItem,
  type Slot,
  type HumanRating,
} from '@/lib/blind-evaluation';

const slots: [Slot, string][] = [
  ['tops', '상의'],
  ['bottoms', '하의'],
  ['shoes', '신발'],
];
export function BlindEvaluation() {
  const [set, update] = useState<EvaluationSet | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [storageStatus, setStorageStatus] = useState('');
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await readEvaluation();
        if (!active) return;
        if (raw) {
          update(parseBackup(raw));
        } else update(createSet());
      } catch {
        if (active) setError('저장된 평가를 복원하지 못했어요. 새 평가 시작으로 복구할 수 있어요.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  function save(next: EvaluationSet) {
    update(next);
    setStorageStatus('저장 중…');
    void writeEvaluation(JSON.stringify(next))
      .then(() => setStorageStatus('브라우저에 저장됨'))
      .catch(() => {
        setStorageStatus('저장 실패');
        setError(
          '브라우저 저장에 실패했어요. 현재 내용은 내보내기로 백업해주세요. 새로고침하면 사라질 수 있어요.',
        );
      });
    setError('');
  }
  async function upload(files: FileList | null, slot: Slot) {
    if (!files || !set || set.lockedAt) return;
    setBusy(true);
    setError('');
    try {
      if (set.items.length + files.length > 30)
        throw new Error('한 세트는 최대 30장까지 넣어주세요.');
      const added: EvalItem[] = [];
      for (const file of Array.from(files)) {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 2 * 1024 * 1024
        )
          throw new Error('JPG·PNG·WebP, 장당 2MB 이하 사진을 넣어주세요.');
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        const hash = await sha256(await file.arrayBuffer());
        if ([...set.items, ...added].some((i) => i.sha256 === hash))
          throw new Error('같은 사진이 이미 있어요. 중복 파일을 빼고 다시 선택해주세요.');
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        added.push({ id: `item_${crypto.randomUUID()}`, slot, image, sha256: hash });
      }
      save({ ...set, items: [...set.items, ...added], candidates: [], ratings: {} });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '사진을 읽지 못했어요. 다른 사진으로 다시 시도해주세요.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function practice() {
    setBusy(true);
    try {
      const next = createSet();
      next.practice = true;
      next.items = await Promise.all(
        sampleGarments().map(async (g) => {
          const response = await fetch(g.image);
          if (!response.ok) throw new Error('예시 사진을 불러오지 못했어요.');
          const blob = await response.blob();
          const image = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(blob);
          });
          return {
            id: g.id,
            slot: (g.category === '상의'
              ? 'tops'
              : g.category === '하의'
                ? 'bottoms'
                : 'shoes') as Slot,
            image,
            sha256: await sha256(await blob.arrayBuffer()),
          };
        }),
      );
      save(next);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '예시를 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  const candidate = set?.candidates[index];
  const rating = candidate ? set?.ratings[candidate.id] : undefined;
  function rate(patch: Partial<HumanRating>) {
    if (!set || !candidate || set.lockedAt) return;
    save({
      ...set,
      ratings: {
        ...set.ratings,
        [candidate.id]: { visual: '', context: '', reason: '', ...rating, ...patch },
      },
    });
  }
  return (
    <main className="outfit-demo blind-eval">
      <Link href="/demo/outfits">← 코디 데모</Link>
      <PageHeading
        eyebrow="HUMAN EVALUATION"
        title="내 눈으로 먼저, 코디 평가"
        description="모델의 답을 보기 전에 판단을 기록해요. 이 화면은 GPU 없이 사용할 수 있어요."
      />
      {error && <ErrorBox message={error} />}
      <p className="caption" role="status">
        {storageStatus}
      </p>
      <div className="eval-toolbar">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            if (
              !set ||
              set.items.length === 0 ||
              confirm('현재 평가를 내보냈나요? 새 평가로 바꾸면 현재 브라우저 기록이 교체돼요.')
            ) {
              save(createSet());
              setIndex(0);
            }
          }}
        >
          새 평가 시작
        </button>
        <button
          className="button secondary"
          disabled={busy || !!set?.items.length}
          onClick={practice}
        >
          예시로 연습하기
        </button>
        {set && (
          <button
            className="button secondary"
            onClick={() => downloadJson(`${set.id}-backup.json`, set)}
          >
            사진·평가 백업
          </button>
        )}
        <label>
          백업 불러오기
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (set?.items.length && !confirm('현재 내용을 백업했나요? 불러온 평가로 교체돼요.'))
                return;
              try {
                if (file.size > 85 * 1024 * 1024) throw new Error('백업 파일이 너무 커요.');
                save(parseBackup(await file.text()));
                setIndex(0);
              } catch (e) {
                setError(e instanceof Error ? e.message : '백업을 읽지 못했어요.');
              }
            }}
          />
        </label>
      </div>
      {set && (
        <>
          <p className="eval-notice">
            {set.practice
              ? '연습 세트 · 기존 사진이므로 독립 성능 검증에 사용하지 않아요.'
              : '새 사진 평가 세트 · 이미 개발에 쓴 사진인지 직접 확인해주세요.'}{' '}
            사진은 이 브라우저에 저장되며 업로드 서버로 전송하지 않아요.
          </p>
          <div className="demo-controls">
            <label>
              평가자 별칭
              <input
                disabled={!!set.lockedAt}
                value={set.evaluator}
                onChange={(e) => save({ ...set, evaluator: e.target.value })}
                placeholder="예: jimin"
              />
            </label>
            <label>
              평가자 구분
              <select
                disabled={!!set.lockedAt}
                value={set.evaluatorRole}
                onChange={(e) =>
                  save({ ...set, evaluatorRole: e.target.value as EvaluationSet['evaluatorRole'] })
                }
              >
                <option value="user">사용자</option>
                <option value="expert">패션 전문가</option>
                <option value="other">기타</option>
              </select>
            </label>
            <label>
              공통 외출 상황
              <input
                disabled={!!set.candidates.length}
                value={set.occasion}
                onChange={(e) => save({ ...set, occasion: e.target.value })}
              />
            </label>
          </div>
          {!set.candidates.length ? (
            <>
              <h2>01. 평가할 옷 준비</h2>
              <p className="subtle">
                상의·하의·신발 각 5장 권장. JPG·PNG·WebP, 장당 2MB 이하, 전체 30장 이하.
              </p>
              <div className="eval-slots">
                {slots.map(([slot, label]) => (
                  <section key={slot}>
                    <h3>
                      {label} · {set.items.filter((i) => i.slot === slot).length}장
                    </h3>
                    <input
                      aria-label={`${label} 사진 추가`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy}
                      onChange={(e) => {
                        void upload(e.target.files, slot);
                        e.target.value = '';
                      }}
                    />
                    <div className="demo-wardrobe">
                      {set.items
                        .filter((i) => i.slot === slot)
                        .map((i) => (
                          <div key={i.id}>
                            <img src={i.image} alt={`${label} 평가 사진`} />
                            <button
                              onClick={() =>
                                save({ ...set, items: set.items.filter((x) => x.id !== i.id) })
                              }
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
              <button
                className="button primary"
                disabled={
                  busy ||
                  slots.some(([s]) => !set.items.some((i) => i.slot === s)) ||
                  !set.occasion.trim()
                }
                onClick={() => {
                  save({ ...set, candidates: makeCandidates(set.items), ratings: {} });
                  setIndex(0);
                }}
              >
                최대 24개 코디 구성하기
              </button>
              {busy && <p role="status">사진을 읽고 있어요…</p>}
            </>
          ) : (
            <>
              <h2>02. 모델 결과 없이 평가</h2>
              <p>
                기록 {Object.values(set.ratings).filter((r) => r.reason.trim()).length} /{' '}
                {set.candidates.length} · 상황: {set.occasion}
              </p>
              <p className="subtle">
                시각적 조화는 색·패턴·질감·형태의 관계로, 상황 적합성은 별도로 판단해주세요. 보이지
                않는 소재 성분이나 실제 착용 핏은 추정하지 마세요.
              </p>
              {candidate && (
                <section className="eval-card">
                  <h3>코디 {index + 1}</h3>
                  <div className="eval-images">
                    {candidate.itemIds.map((id) => {
                      const i = set.items.find((x) => x.id === id)!;
                      return (
                        <img key={id} src={i.image} alt={slots.find(([s]) => s === i.slot)?.[1]} />
                      );
                    })}
                  </div>
                  <fieldset disabled={!!set.lockedAt}>
                    <legend>시각적으로 어울리나요?</legend>
                    <div className="eval-toolbar">
                      {(
                        [
                          ['good', '좋음'],
                          ['ordinary', '무난'],
                          ['awkward', '어색함'],
                        ] as const
                      ).map(([v, text]) => (
                        <button
                          key={v}
                          aria-pressed={rating?.visual === v}
                          className={`button ${rating?.visual === v ? 'primary' : 'secondary'}`}
                          onClick={() => rate({ visual: v })}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                    <label>
                      상황 적합성
                      <select
                        value={rating?.context || ''}
                        onChange={(e) =>
                          rate({ context: e.target.value as HumanRating['context'] })
                        }
                      >
                        <option value="">선택해주세요</option>
                        <option value="uncertain">판단 어려움</option>
                        <option value="suitable">적합</option>
                        <option value="unsuitable">부적합</option>
                      </select>
                    </label>
                    <label>
                      판단 이유 (필수)
                      <textarea
                        value={rating?.reason || ''}
                        maxLength={1000}
                        placeholder="예: 상하의 패턴이 모두 강해 복잡하게 느껴짐"
                        onChange={(e) => rate({ reason: e.target.value })}
                      />
                    </label>
                  </fieldset>
                </section>
              )}
              <div className="eval-toolbar">
                <button
                  className="button secondary"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  이전
                </button>
                <span>
                  {index + 1} / {set.candidates.length}
                </span>
                <button
                  className="button secondary"
                  disabled={index === set.candidates.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  다음
                </button>
              </div>
              {!set.lockedAt ? (
                <button
                  className="button primary"
                  disabled={!canLock(set)}
                  onClick={() => save({ ...set, lockedAt: new Date().toISOString() })}
                >
                  평가 확정하고 실험 준비
                </button>
              ) : (
                <section className="eval-notice">
                  <h3>평가 확정 완료</h3>
                  <p>
                    사람 평가를 확정했어요. 실험 입력에는 사진·구성·상황만 포함되고 사람의 답은
                    빠져요.
                  </p>
                  <div className="eval-toolbar">
                    <button
                      className="button primary"
                      onClick={() =>
                        downloadJson(`${set.id}-experiment.json`, experimentPayload(set))
                      }
                    >
                      데탑 실험 입력 내보내기
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        downloadJson(`${set.id}-human.json`, {
                          setId: set.id,
                          practice: set.practice,
                          evaluator: set.evaluator,
                          evaluatorRole: set.evaluatorRole,
                          lockedAt: set.lockedAt,
                          ratings: set.ratings,
                        })
                      }
                    >
                      사람 평가 내보내기
                    </button>
                  </div>
                  <p>
                    모델 실행·결과 비교는 데탑 실험 단계에서 진행해요. 모델 입력에 사람 평가 파일을
                    넣지 마세요.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
