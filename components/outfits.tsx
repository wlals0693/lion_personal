'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Heart, RefreshCw, Sparkles, Pin, Check, CalendarDays } from 'lucide-react';
import type { Outfit } from '@/lib/types';
import { wardrobeApi } from '@/lib/mock-api';
import { recommendationDecision } from '@/lib/outfit-evaluation';
import { localDate, toggleValue, uid } from '@/lib/utils';
import { useWardrobe } from './store';
import { AiOutfitEvaluator, EvaluationSummary } from './ai-outfits';
import {
  Empty,
  ErrorBox,
  GarmentImage,
  Loading,
  MockLabel,
  OutfitCollage,
  PageHeading,
} from './ui';
const occasions = ['일상·산책', '출근·등교', '약속·데이트', '여행·나들이'];
export function outfitHref(outfit: Outfit) {
  return `/outfits/detail?items=${encodeURIComponent(outfit.itemIds.join(','))}&occasion=${encodeURIComponent(outfit.occasion)}`;
}
export function Outfits() {
  const { state, update, notify } = useWardrobe();
  const params = useSearchParams();
  const anchor = params.get('anchor') || undefined;
  const [occasion, setOccasion] = useState('일상·산책'),
    [results, setResults] = useState<Outfit[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [offset, setOffset] = useState(0);
  const fixed = state.garments.find((g) => g.id === anchor);
  const [aiActive, setAiActive] = useState(false);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError('');
    setResults([]);
    setOffset(0);
    wardrobeApi
      .recommend(state.garments, occasion, anchor)
      .then((value) => {
        if (current) setResults(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [state.garments, occasion, anchor, retry]);
  const displayed = Array.from(
    { length: Math.min(3, results.length) },
    (_, i) => results[(offset + i) % results.length],
  );
  return (
    <>
      <PageHeading
        eyebrow="DRESS YOUR DAY"
        title="오늘, 어떻게 입을까요?"
        description="상황을 고르고 내 옷의 새로운 조합을 만나보세요."
      />
      <div className="recommend-toolbar">
        <div className="chips">
          {occasions.map((o) => (
            <button
              className={`chip ${occasion === o ? 'selected' : ''}`}
              key={o}
              aria-pressed={occasion === o}
              onClick={() => setOccasion(o)}
            >
              {o}
            </button>
          ))}
        </div>
        <Link className="text-button" href="/demo/outfits">
          예시 옷장 AI 데모
        </Link>
      </div>
      {anchor && (
        <div className="anchor-strip">
          <Pin size={17} />
          <span>{fixed?.name || '찾을 수 없는 옷'} 고정 중</span>
          <Link href="/outfits">고정 해제</Link>
        </div>
      )}
      <AiOutfitEvaluator
        items={state.garments}
        occasion={occasion}
        anchor={anchor}
        onEvaluated={setAiActive}
        onResults={(outfits) =>
          update((s) => ({
            ...s,
            evaluatedOutfits: outfits.filter(
              (o) => recommendationDecision(o.evaluation!) === 'recommend',
            ),
          }))
        }
        likes={state.likes}
        onLike={(id) => update((s) => ({ ...s, likes: toggleValue(s.likes, id) }))}
      />
      {aiActive ? null : busy ? (
        <Loading text="내 옷으로 조합을 준비하고 있어요" />
      ) : error ? (
        <ErrorBox message={error} retry={() => setRetry((v) => v + 1)} />
      ) : !results.length ? (
        <Empty
          title={anchor ? '이 옷으로 조합을 만들기 어려워요' : '코디를 만들 옷이 더 필요해요'}
          description="추천 제외 상태를 확인하고, 상의·하의·신발 또는 원피스·신발을 준비해주세요."
          href="/wardrobe/new"
        />
      ) : (
        <>
          <div className="section-heading">
            <span className="subtle">
              평가 전 코디 후보 · 위 버튼으로 실제 AI 평가를 받아보세요
            </span>
            <button
              className="button secondary"
              disabled={results.length <= 1}
              onClick={() => {
                setOffset((v) => (v + 1) % results.length);
                notify('다른 조합을 보여드려요. 넘긴 코디를 싫어요로 기록하지 않아요.');
              }}
            >
              <RefreshCw size={15} />
              다른 코디 보기
            </button>
          </div>
          <div className="outfit-grid">
            {displayed.map((outfit, i) => (
              <article className="outfit-card" key={outfit.id}>
                <div className="outfit-card-image">
                  <Link href={outfitHref(outfit)} aria-label={`${i + 1}번 코디 상세`}>
                    <OutfitCollage outfit={outfit} items={state.garments} />
                  </Link>
                  <span className="look-number">
                    LOOK {String(((offset + i) % results.length) + 1).padStart(2, '0')}
                  </span>
                  <button
                    className={`like-button ${state.likes.includes(outfit.id) ? 'liked' : ''}`}
                    aria-label="코디 좋아요"
                    aria-pressed={state.likes.includes(outfit.id)}
                    onClick={() =>
                      update((s) => ({ ...s, likes: toggleValue(s.likes, outfit.id) }))
                    }
                  >
                    <Heart
                      size={19}
                      fill={state.likes.includes(outfit.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <div className="outfit-card-copy">
                  <span className="eyebrow">{occasion}</span>
                  <h2>{outfit.title}</h2>
                  <p className="subtle">
                    {outfit.itemIds
                      .map((id) => state.garments.find((g) => g.id === id)?.name)
                      .join(' + ')}
                  </p>
                  <Link className="text-button" href={outfitHref(outfit)}>
                    코디 자세히 보기
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="caption">
            이 목록은 카테고리로 구성한 평가 전 후보예요. 아직 어울림 순서로 정렬하지 않았어요.
          </p>
        </>
      )}
    </>
  );
}
export function OutfitDetail() {
  const { state, update, notify } = useWardrobe();
  const router = useRouter();
  const params = useSearchParams();
  const ids = [...new Set((params.get('items') || '').split(',').filter(Boolean))];
  const occasion = params.get('occasion') || '일상·산책';
  const garments = ids.map((id) => state.garments.find((g) => g.id === id));
  if (!ids.length || garments.some((g) => !g))
    return (
      <Empty
        title="코디의 옷을 찾을 수 없어요"
        description="의류가 삭제되었을 수 있어요. 현재 옷장으로 다시 추천받아보세요."
        href="/outfits"
        label="코디 추천으로"
      />
    );
  const outfit: Outfit = {
    id: 'outfit:' + ids.join(':'),
    itemIds: ids,
    occasion,
    title: '내 옷으로 완성하는 오늘',
  };
  const evaluated = state.evaluatedOutfits?.find(
    (o) => o.occasion === occasion && o.itemIds.join(',') === ids.join(','),
  );
  const planned = state.records.find(
    (r) => r.date === localDate() && r.itemIds.join(',') === ids.join(','),
  );
  function wear() {
    if (planned) {
      router.push(`/records?edit=${planned.id}`);
      return;
    }
    const record = {
      id: uid('wear'),
      date: localDate(),
      itemIds: ids,
      status: 'planned' as const,
      note: occasion,
    };
    if (update((s) => ({ ...s, records: [record, ...s.records] }))) {
      notify('오늘 입을 예정으로 저장했어요. 실제 착용 여부는 기록에서 바꿀 수 있어요.');
      router.push(`/records?edit=${record.id}`);
    }
  }
  return (
    <>
      <PageHeading eyebrow="YOUR OUTFIT" title="이 조합, 어떤가요?" back="/outfits" />
      <div className="outfit-detail-layout">
        <OutfitCollage outfit={outfit} items={state.garments} large />
        <section>
          {evaluated?.evaluation ? (
            <EvaluationSummary value={evaluated.evaluation} />
          ) : (
            <MockLabel>아직 AI가 평가하지 않은 코디 구성이에요</MockLabel>
          )}
          <p className="eyebrow">{occasion}</p>
          <h1>{outfit.title}</h1>
          <p className="subtle">익숙한 옷도 함께 입는 조합에 따라 새로워져요.</p>
          <div className="outfit-item-list">
            {garments.map(
              (g) =>
                g && (
                  <Link key={g.id} href={`/wardrobe/${g.id}`}>
                    <GarmentImage item={g} />
                    <span>
                      <small>{g.category}</small>
                      {g.name}
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                ),
            )}
          </div>
          <button className="button primary full" onClick={wear}>
            <CalendarDays size={17} />
            {planned ? '오늘 저장한 기록 보기' : '오늘 입을래요'}
          </button>
          <p className="caption">
            ‘입을 예정’으로 저장해요. 실제 착용이 확인된 것으로 처리하지 않아요.
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              aria-pressed={state.likes.includes(outfit.id)}
              onClick={() => update((s) => ({ ...s, likes: toggleValue(s.likes, outfit.id) }))}
            >
              <Heart size={17} fill={state.likes.includes(outfit.id) ? 'currentColor' : 'none'} />
              {state.likes.includes(outfit.id) ? '좋아요 저장됨' : '좋아요'}
            </button>
            <Link className="button secondary" href="/outfits">
              <RefreshCw size={16} />
              다른 코디
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
