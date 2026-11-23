'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWardrobe } from './store';
import { PageHeading } from './ui';

export function DemoStart() {
  const { state, update, notify } = useWardrobe();
  const [health, setHealth] = useState('아직 연결을 확인하지 않았어요');
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const response = await fetch('/api/gpu/health', { cache: 'no-store' });
      const value = await response.json();
      setHealth(
        response.ok && value.ready
          ? 'Qwen GPU 서버 연결 준비 완료'
          : value.message || 'GPU 서버를 확인해주세요',
      );
    } catch {
      setHealth('연결을 확인하지 못했어요. 웹 서버를 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }
  function removeSamples() {
    if (!confirm('예시 의류와 연결된 예시 기록·좋아요를 정리할까요? 직접 등록한 사진은 남아요.'))
      return;
    const keep = new Set(state.garments.filter((g) => g.source === 'upload').map((g) => g.id));
    if (
      update((s) => ({
        ...s,
        garments: s.garments.filter((g) => keep.has(g.id)),
        records: s.records.filter((r) => r.itemIds.every((id) => keep.has(id))),
        likes: s.likes.filter((id) =>
          id
            .split(':')
            .slice(1)
            .every((i) => keep.has(i)),
        ),
      }))
    )
      notify('직접 등록한 옷만 남겼어요.');
  }
  const uploaded = state.garments.filter((g) => g.source === 'upload');
  return (
    <main id="main-content" className="outfit-demo">
      <PageHeading
        eyebrow="LIVE SERVICE WALKTHROUGH"
        title="사진 한 장에서 오늘의 코디까지"
        description="내 사진 등록 → AI 코디 평가 → 입을 예정 기록. 실제 GPU 연결은 데탑에서 확인해요."
      />
      <section className="ai-intro">
        <h2>01. 실제 AI 연결 확인</h2>
        <p role="status">{health}</p>
        <button className="button secondary" disabled={busy} onClick={() => void check()}>
          {busy ? '연결 확인 중…' : 'GPU 연결 확인'}
        </button>
        <p className="caption">
          연결 확인은 서버 준비 상태이며 분석 정확도를 뜻하지 않아요. 노트북에서 GPU 서버 없이
          실행하면 연결되지 않는 것이 정상이에요.
        </p>
      </section>
      <section className="ai-intro">
        <h2>02. 내 사진으로 옷장 채우기</h2>
        <p>
          직접 등록한 옷 {uploaded.length}벌 ·{' '}
          {(['상의', '하의', '신발'] as const)
            .map((c) => `${c} ${uploaded.filter((g) => g.category === c).length}`)
            .join(' / ')}
        </p>
        <p>
          상의·하의·신발 각 3장 권장. 사진을 올리면 AI 결과가 자동 입력돼요. 필요한 내용만 확인하고
          저장하세요.
        </p>
        <div className="button-row">
          <Link
            className="button primary"
            href={state.loggedIn ? (state.onboarded ? '/wardrobe/new' : '/onboarding') : '/login'}
          >
            {state.loggedIn ? '옷 등록 시작' : '체험 로그인부터 시작'}
          </Link>
          <button
            className="button secondary"
            disabled={!state.garments.some((g) => g.source === 'sample')}
            onClick={removeSamples}
          >
            예시 옷만 정리
          </button>
        </div>
      </section>
      <section className="ai-intro">
        <h2>03. 내 옷으로 AI 코디 추천</h2>
        <p>
          옷장에서 한 벌을 선택해 고정 추천을 시작하거나 코디 화면에서 상황을 골라보세요. ‘AI로 코디
          추천받기’를 눌러 실제 사진 평가를 실행해요.
        </p>
        <div className="button-row">
          <Link className="button primary" href="/wardrobe">
            옷장에서 한 벌 고르기
          </Link>
          <Link className="button secondary" href="/outfits">
            코디 화면
          </Link>
        </div>
      </section>
      <section className="ai-intro">
        <h2>04. 선택한 코디를 하루의 기록으로</h2>
        <p>
          평가된 코디의 상세 보기 → 오늘 입을래요 → 기록 저장 → HOME 순서로 이어집니다. ‘입을
          예정’은 실제 착용 확인과 구분해요.
        </p>
        <div className="button-row">
          <Link className="button secondary" href="/records">
            착용 기록
          </Link>
          <Link className="button primary" href="/">
            HOME
          </Link>
        </div>
      </section>
      <p className="caption">
        로그인·날씨·구매분석은 체험용 예시예요. 등록과 코디 평가는 Qwen 추론이며 개인화·학습 궁합
        모델은 아직 연결하지 않았어요. 사진과 기록은 현재 브라우저에 저장돼 다른 기기에 자동
        동기화되지 않아요.
      </p>
    </main>
  );
}
