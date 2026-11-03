'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserRound, Check, LogOut, ArrowRight } from 'lucide-react';
import { colors, styles } from '@/lib/types';
import { toggleValue } from '@/lib/utils';
import { failNextRequest } from '@/lib/mock-api';
import { useWardrobe } from './store';
import { outfitHref } from './outfits';
import { GarmentImage, Modal, PageHeading, SectionHeading } from './ui';
export function Profile() {
  const { state, update, notify, reset } = useWardrobe();
  const router = useRouter();
  const [nickname, setNickname] = useState(state.profile.nickname),
    [preferred, setPreferred] = useState(state.profile.styles),
    [preferredColors, setColors] = useState(state.profile.colors),
    [region, setRegion] = useState(state.profile.region),
    [confirm, setConfirm] = useState(false);
  const excluded = state.garments.filter((g) => g.excluded);
  const liked = state.likes
    .map((id) => ({
      id,
      itemIds: id.replace(/^outfit:/, '').split(':'),
      occasion: '좋아요한 코디',
      title: '저장한 코디',
    }))
    .filter((o) => o.itemIds.every((id) => state.garments.some((g) => g.id === id)));
  return (
    <>
      <PageHeading eyebrow="MY PAGE" title="나의 취향, 나의 설정" back="/" />
      <div className="profile-layout">
        <section className="profile-main">
          <div className="profile-intro">
            <span className="profile-avatar">
              <UserRound size={30} strokeWidth={1.3} />
            </span>
            <div>
              <h2>{state.profile.nickname}님의 옷장</h2>
              <span className="subtle">
                의류 {state.garments.length}벌 · 좋아요 {state.likes.length}개
              </span>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                update((s) => ({
                  ...s,
                  profile: {
                    nickname: nickname.trim() || '나',
                    styles: preferred,
                    colors: preferredColors,
                    region,
                  },
                }))
              )
                notify('취향과 설정을 저장했어요.');
            }}
          >
            <label className="field">
              닉네임
              <input
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </label>
            <fieldset>
              <legend>선호 스타일</legend>
              <div className="chips">
                {styles.map((s) => (
                  <button
                    type="button"
                    className={`chip ${preferred.includes(s) ? 'selected' : ''}`}
                    key={s}
                    aria-pressed={preferred.includes(s)}
                    onClick={() => setPreferred(toggleValue(preferred, s))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>선호 색상</legend>
              <div className="chips">
                {colors
                  .filter((c) => c !== '잘 모르겠어요')
                  .map((c) => (
                    <button
                      type="button"
                      className={`chip ${preferredColors.includes(c) ? 'selected' : ''}`}
                      key={c}
                      aria-pressed={preferredColors.includes(c)}
                      onClick={() => setColors(toggleValue(preferredColors, c))}
                    >
                      {c}
                    </button>
                  ))}
              </div>
            </fieldset>
            <label className="field">
              날씨 지역
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                {['서울', '부산', '대구', '인천', '광주', '대전', '제주'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="caption">
              지역과 취향은 저장돼요. 실제 날씨·개인화 추천 API는 아직 연결되지 않았어요.
            </p>
            <button className="button primary">
              <Check size={16} />
              설정 저장
            </button>
          </form>
        </section>
        <section className="profile-side">
          <SectionHeading title="추천 제외 의류" />
          {excluded.length ? (
            excluded.map((g) => (
              <div className="excluded-row" key={g.id}>
                <Link href={`/wardrobe/${g.id}`}>
                  <GarmentImage item={g} />
                </Link>
                <span>{g.name}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      update((s) => ({
                        ...s,
                        garments: s.garments.map((item) =>
                          item.id === g.id ? { ...item, excluded: false } : item,
                        ),
                      }))
                    )
                      notify('추천에 다시 포함했어요.');
                  }}
                >
                  해제
                </button>
              </div>
            ))
          ) : (
            <p className="quiet-empty">추천에서 제외한 옷이 없어요.</p>
          )}
          <SectionHeading title="좋아요한 코디" />
          {liked.length ? (
            <div className="liked-list">
              {liked.map((o, i) => (
                <Link href={outfitHref(o)} key={o.id}>
                  <span>저장한 코디 {i + 1}</span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">마음에 드는 코디에 좋아요를 눌러보세요.</p>
          )}
          <SectionHeading title="계정 설정" />
          <button
            className="settings-row"
            onClick={() => {
              if (update((s) => ({ ...s, loggedIn: false }))) router.push('/login');
            }}
          >
            <span>로그아웃</span>
            <LogOut size={16} />
          </button>
          <button className="settings-row" onClick={() => setConfirm(true)}>
            <span>체험 데이터 초기화</span>
            <ArrowRight size={16} />
          </button>
          <details className="demo-settings">
            <summary>체험 동작 확인</summary>
            <p className="caption">
              다음 로그인·분석·추천 요청을 한 번 실패시켜 오류 화면과 재시도를 확인해요.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                failNextRequest();
                notify('다음 요청에서 오류 화면을 보여드릴게요.');
              }}
            >
              다음 요청 실패 체험
            </button>
          </details>
        </section>
      </div>
      {confirm && (
        <Modal title="체험 데이터를 초기화할까요?" onClose={() => setConfirm(false)}>
          <p className="subtle">
            이 브라우저에 등록한 사진·설정·좋아요·기록을 지우고 처음부터 시작해요. 실제 계정에는
            영향을 주지 않아요.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(false)}>
              취소
            </button>
            <button
              className="button danger"
              onClick={() => {
                reset();
                router.push('/login');
              }}
            >
              초기화
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
