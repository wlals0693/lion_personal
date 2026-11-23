'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Garment, Outfit, OutfitEvaluation } from '@/lib/types';
import {
  aspectLabels,
  contextLabels,
  evaluateOutfits,
  outfitCandidates,
  outfitOccasions,
  visualLabels,
  recommendationDecision,
} from '@/lib/outfit-evaluation';
import { ErrorBox, OutfitCollage } from './ui';

export function EvaluationSummary({ value }: { value: OutfitEvaluation }) {
  return (
    <div className="evaluation-summary" data-testid="outfit-evaluation">
      <div className="evaluation-badges">
        <strong>{visualLabels[value.visual]}</strong>
        <span>{contextLabels[value.context]}</span>
      </div>
      <ul>
        {value.reasons.map((reason, i) => (
          <li key={i}>
            {reason.observation}
            {reason.evidence && <small className="evidence-note">관찰 · {reason.evidence}</small>}
          </li>
        ))}
      </ul>
      <p>
        <b>상황</b> · {value.contextReason}
      </p>
      <details>
        <summary>AI 판단의 범위</summary>
        <ul>
          {value.limitations.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
export function AiOutfitEvaluator({
  items,
  occasion,
  anchor,
  onEvaluated,
  demo = false,
  likes = [],
  onLike,
  onResults,
}: {
  items: Garment[];
  occasion: string;
  anchor?: string;
  onEvaluated?: (value: boolean) => void;
  demo?: boolean;
  likes?: string[];
  onLike?: (id: string) => void;
  onResults?: (outfits: Outfit[]) => void;
}) {
  const [candidateOffset, setCandidateOffset] = useState(0);
  const candidates = useMemo(
    () => outfitCandidates(items, occasion, anchor, candidateOffset),
    [items, occasion, anchor, candidateOffset],
  );
  const [ranked, setRanked] = useState<Outfit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setRanked([]);
    setError('');
    setBusy(false);
    setSeconds(null);
    onEvaluated?.(false);
    return () => controller.current?.abort();
  }, [items, occasion, anchor, onEvaluated, candidateOffset]);
  useEffect(() => setCandidateOffset(0), [items, occasion, anchor]);
  async function evaluate() {
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    setBusy(true);
    setError('');
    setRanked([]);
    onEvaluated?.(false);
    const start = performance.now();
    try {
      const result = await evaluateOutfits(items, candidates, occasion, current.signal);
      if (current.signal.aborted) return;
      setRanked(result.outfits);
      onResults?.(result.outfits);
      setSeconds((performance.now() - start) / 1000);
      onEvaluated?.(true);
    } catch (e) {
      if (!current.signal.aborted) setError((e as Error).message);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="ai-recommendation" aria-label="실제 AI 코디 평가">
      <div className="ai-intro">
        <p className="eyebrow">YOUR NEXT LOOK</p>
        <h2>있는 옷에서, 새로운 조합을.</h2>
        <p>오늘의 상황에 맞춰 함께 입을 만한 조합을 찾아보세요.</p>
        <p className="caption">사진 기반 AI 제안 · 실제 착용 핏과 개인 취향은 직접 확인해주세요.</p>
        <button
          className="button primary"
          disabled={busy || !candidates.length}
          onClick={() => void evaluate()}
        >
          {busy ? `코디 ${candidates.length}개를 GPU로 평가하고 있어요…` : 'AI로 코디 추천받기'}
        </button>
        <button
          className="button secondary"
          disabled={busy || candidates.length <= 1}
          onClick={() => setCandidateOffset((value) => value + 6)}
        >
          다른 후보 만들기
        </button>
        {!candidates.length && (
          <p role="status">
            상의·하의·신발 또는 원피스·신발이 필요해요. 고정한 옷의 추천 제외 상태도 확인해주세요.
          </p>
        )}
      </div>
      {busy && (
        <p role="status" className="state-box">
          각 코디의 전체 조화를 확인하고 있어요. 첫 평가에는 모델 준비 시간이 더 걸릴 수 있어요.
        </p>
      )}
      {error && <ErrorBox message={error} retry={() => void evaluate()} />}
      {ranked.length > 0 && (
        <>
          <p role="status" data-testid="outfit-timing" data-seconds={seconds}>
            함께 입을 만한 조합{' '}
            {ranked.filter((o) => recommendationDecision(o.evaluation!) === 'recommend').length}개 ·{' '}
            {seconds?.toFixed(1)}초
          </p>
          <p className="caption">같은 평가의 코디 사이에 세밀한 우열을 매기지는 않아요.</p>
        </>
      )}
      {(ranked.length > 0 || demo) && (
        <div className="outfit-grid">
          {(ranked.length
            ? ranked.filter((o) => recommendationDecision(o.evaluation!) === 'recommend')
            : candidates
          ).map((outfit, i) => (
            <article
              className="outfit-card"
              key={outfit.id}
              data-testid="ai-outfit-card"
              data-item-ids={outfit.itemIds.join(',')}
            >
              <OutfitCollage outfit={outfit} items={items} />
              <div className="outfit-card-copy">
                <p className="eyebrow">
                  {outfit.evaluation
                    ? `LOOK ${String(i + 1).padStart(2, '0')}`
                    : `평가 전 후보 ${i + 1}`}{' '}
                  · {occasion}
                </p>
                <h3>
                  {outfit.itemIds.map((id) => items.find((g) => g.id === id)?.name).join(' + ')}
                </h3>
                {outfit.evaluation && <EvaluationSummary value={outfit.evaluation} />}
                {!demo && (
                  <Link
                    className="text-button"
                    href={`/outfits/detail?items=${encodeURIComponent(outfit.itemIds.join(','))}&occasion=${encodeURIComponent(occasion)}`}
                  >
                    코디 자세히 보기
                  </Link>
                )}
                {onLike && (
                  <button
                    className="button secondary"
                    aria-pressed={likes.includes(outfit.id)}
                    onClick={() => onLike(outfit.id)}
                  >
                    {likes.includes(outfit.id) ? '좋아요 해제' : '코디 좋아요'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {ranked.length > 0 &&
        !ranked.some((o) => recommendationDecision(o.evaluation!) === 'recommend') && (
          <div className="quiet-empty">
            <h3>이번 후보에서는 확신 있게 제안할 조합이 없어요.</h3>
            <p>다른 후보를 만들거나 외출 상황을 바꿔보세요.</p>
          </div>
        )}
      {ranked.some((o) => recommendationDecision(o.evaluation!) !== 'recommend') && (
        <details className="evaluation-method">
          <summary>
            보류·제외한 후보 보기 (
            {ranked.filter((o) => recommendationDecision(o.evaluation!) !== 'recommend').length})
          </summary>
          <div className="outfit-grid">
            {ranked
              .filter((o) => recommendationDecision(o.evaluation!) !== 'recommend')
              .map((o) => (
                <article className="outfit-card" key={o.id}>
                  <OutfitCollage outfit={o} items={items} />
                  <div className="outfit-card-copy">
                    <p className="eyebrow">
                      {recommendationDecision(o.evaluation!) === 'reject'
                        ? '이번 추천에서 제외'
                        : '추가 확인 필요'}
                    </p>
                    <EvaluationSummary value={o.evaluation!} />
                  </div>
                </article>
              ))}
          </div>
        </details>
      )}
      <details className="evaluation-method">
        <summary>어떤 기준으로 평가하나요?</summary>
        <p>
          색상·패턴·질감·형태의 관계와 전체 조화를 관찰합니다. 같은 색 또는 같은 스타일이라고 무조건
          높게 평가하지 않습니다. 상황 적합성은 별도 판단이며 직장 규정·날씨는 주어지지 않았습니다.
        </p>
        <p>
          <a
            href="https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mariya_Vasileva_Learning_Type-Aware_Embeddings_ECCV_2018_paper.php"
            target="_blank"
            rel="noreferrer"
          >
            ECCV 2018 · 유사성과 호환성 구분
          </a>{' '}
          ·{' '}
          <a
            href="https://openaccess.thecvf.com/content/WACV2023/papers/Sarkar_OutfitTransformer_Learning_Outfit_Representations_for_Fashion_Recommendation_WACV_2023_paper.pdf"
            target="_blank"
            rel="noreferrer"
          >
            WACV 2023 · 코디 전체 평가
          </a>
        </p>
        <p>
          이 연구를 참고해 설계한 초기 VLM 평가이며, 논문의 모델을 재현하거나 동일한 성능을 검증한
          것은 아닙니다.
        </p>
      </details>
    </section>
  );
}
export function OutfitDemo() {
  const [catalog, setCatalog] = useState<{
    items: Garment[];
    providedCount: number;
    supplementCount: number;
    note: string;
  } | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [occasion, setOccasion] = useState(outfitOccasions[0]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [anchor, setAnchor] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    setCatalog(null);
    fetch('/api/demo/garments', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error.message);
      });
    return () => controller.abort();
  }, [reload]);
  const items = useMemo(
    () => (catalog?.items || []).map((g) => ({ ...g, excluded: excluded.includes(g.id) })),
    [catalog, excluded],
  );
  const visibleItems = items.filter(
    (g) =>
      (category === '전체' || g.category === category) &&
      `${g.name} ${g.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (!catalog)
    return (
      <main className="outfit-demo">
        <Link href="/demo/evaluation">GPU 없이 코디 평가 준비 →</Link>
        <h1>테스트 의류 자료를 불러오고 있어요</h1>
        {catalogError ? (
          <ErrorBox message={catalogError} retry={() => setReload((v) => v + 1)} />
        ) : (
          <p role="status">전달받은 사진 목록을 확인하고 있어요.</p>
        )}
      </main>
    );
  return (
    <main className="outfit-demo">
      <header>
        <Link href="/demo/evaluation" className="button secondary">
          사람 코디 평가 준비
        </Link>
        <Link href="/login" className="text-button">
          내 옷장으로 이동 →
        </Link>
        <p className="eyebrow">옷의 여유 · AI 코디 데모</p>
        <h1>이 옷들, 함께 입으면 어떨까요?</h1>
        <p data-testid="demo-catalog-count">
          전달받은 의류 {catalog.providedCount}벌 + 하의·신발 예시 {catalog.supplementCount}벌 = 총{' '}
          {items.length}벌로 실제 로컬 GPU 평가를 체험하세요. 내 옷장 데이터는 바뀌지 않아요.
        </p>
        <p className="caption">{catalog.note}</p>
      </header>
      <div className="demo-controls">
        <label className="field">
          상황
          <select
            aria-label="데모 상황"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
          >
            {outfitOccasions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="field">
          꼭 입을 옷
          <select aria-label="고정할 옷" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
            <option value="">고정하지 않기</option>
            {items
              .filter((g) => !g.excluded)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <details>
        <summary>전체 옷 {items.length}벌 보기 · 체크를 끄면 추천에서 제외해요</summary>
        <div className="demo-controls">
          <label className="field">
            옷 검색
            <input
              aria-label="데모 옷 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="옷 이름 또는 photo_059"
            />
          </label>
          <label className="field">
            분류
            <select
              aria-label="데모 옷 분류"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {['전체', '상의', '하의', '신발', '아우터', '원피스'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="caption">
          검색 결과 {visibleItems.length}벌 · 추천 포함 {items.filter((g) => !g.excluded).length}벌
        </p>
        <div className="demo-wardrobe">
          {visibleItems.map((g) => (
            <label key={g.id} data-testid="demo-garment" data-garment-id={g.id}>
              <img src={g.image} alt={g.name} loading="lazy" />
              <small>
                {g.category} · {g.id.startsWith('provided_') ? '전달 자료' : '하의·신발 예시'}
              </small>
              <span>
                <input
                  type="checkbox"
                  aria-label={`${g.name} 추천에 포함`}
                  checked={!g.excluded}
                  onChange={() => {
                    setExcluded((v) =>
                      v.includes(g.id) ? v.filter((id) => id !== g.id) : [...v, g.id],
                    );
                    if (anchor === g.id) setAnchor('');
                  }}
                />
                {g.name}
              </span>
            </label>
          ))}
        </div>
      </details>
      <AiOutfitEvaluator items={items} occasion={occasion} anchor={anchor || undefined} demo />
      <p className="caption">
        로컬 GPU 서버가 필요해요. 실제 사진을 쓰지만 조화 판단의 정확도는 아직 전문가 평가로
        검증하지 않았어요.
      </p>
    </main>
  );
}
