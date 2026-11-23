'use client';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CloudSun,
  Plus,
  Shirt,
  ScanLine,
  CalendarDays,
} from 'lucide-react';
import { useWardrobe } from './store';
import { generateOutfits } from '@/lib/wardrobe-logic';
import { friendlyDate, localDate } from '@/lib/utils';
import { AddButton, Empty, GarmentCard, MockLabel, OutfitCollage, SectionHeading } from './ui';
export function Home() {
  const { state } = useWardrobe();
  const outfit =
    state.evaluatedOutfits?.find(
      (o) =>
        o.evaluation &&
        o.itemIds.every((id) => state.garments.some((g) => g.id === id && !g.excluded)),
    ) || generateOutfits(state.garments, '일상·산책')[0];
  const outfitLink = outfit?.evaluation
    ? `/outfits/detail?items=${encodeURIComponent(outfit.itemIds.join(','))}&occasion=${encodeURIComponent(outfit.occasion)}`
    : '/outfits';
  const recent = [...state.records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const firstName = state.profile.nickname || '나';
  return (
    <>
      <div className="home-greeting">
        <div>
          <p className="eyebrow">A GOOD DAY STARTS IN YOUR WARDROBE</p>
          <h1>
            {firstName}님,
            <br className="mobile-break" /> 오늘도 나답게.
          </h1>
          <p className="subtle">있는 옷으로 발견하는 새로운 하루.</p>
        </div>
        <div className="weather">
          <CloudSun size={29} strokeWidth={1.2} />
          <div>
            <strong>18°</strong>
            <span>{state.profile.region} · 구름 조금</span>
            <small>날씨 예시</small>
          </div>
        </div>
      </div>
      {outfit ? (
        <section className="home-hero">
          <div className="hero-copy">
            <span className="edition">TODAY’S EDIT / {localDate().slice(5).replace('-', '.')}</span>
            <h2>
              익숙한 옷의
              <br />
              <em>새로운 조합.</em>
            </h2>
            <p>
              오늘의 옷 고민은 잠시 내려놓고,
              <br />내 옷장에서 시작해보세요.
            </p>
            <MockLabel>
              {outfit.evaluation
                ? '내 옷 사진으로 AI가 평가한 코디'
                : '평가 전 코디 후보 · 코디 화면에서 AI 평가'}
            </MockLabel>
            <Link className="button primary" href={outfitLink}>
              오늘의 코디 보기
              <ArrowRight size={17} />
            </Link>
          </div>
          <Link className="hero-visual" href={outfitLink} aria-label="오늘의 코디 보기">
            <OutfitCollage outfit={outfit} items={state.garments} large />
            <span className="hero-visual-caption">01 / YOUR EVERYDAY COMBINATION</span>
          </Link>
        </section>
      ) : (
        <Empty
          title="내 옷장에서 하루를 시작해요"
          description="상의·하의·신발 또는 원피스·신발을 등록하면 코디를 체험할 수 있어요."
          href="/wardrobe/new"
        />
      )}
      <div className="home-shortcuts">
        <Link href="/wardrobe">
          <span className="shortcut-icon">
            <Shirt size={21} />
          </span>
          <div>
            <span>나의 옷장</span>
            <strong>{state.garments.length}벌의 가능성</strong>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/purchase">
          <span className="shortcut-icon">
            <ScanLine size={21} />
          </span>
          <div>
            <span>사기 전에 한 번 더</span>
            <strong>내 옷과 어울릴까?</strong>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/records">
          <span className="shortcut-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <span>하루하루 쌓이는 취향</span>
            <strong>착용 기록 {state.records.length}개</strong>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="home-lower">
        <section>
          <SectionHeading title="최근 옷장에 들어온 옷" href="/wardrobe" />
          {state.garments.length ? (
            <div className="home-garments">
              {state.garments.slice(0, 3).map((g) => (
                <GarmentCard key={g.id} item={g} />
              ))}
            </div>
          ) : (
            <AddButton />
          )}
        </section>
        <section>
          <SectionHeading title="최근 착용 기록" href="/records" />
          {recent.length ? (
            <div className="record-preview-list">
              {recent.map((r) => (
                <Link href={`/records?edit=${r.id}`} className="record-preview" key={r.id}>
                  <div className="record-thumbs">
                    {r.itemIds.slice(0, 2).map((id) => {
                      const g = state.garments.find((g) => g.id === id);
                      return g ? <img key={id} src={g.image} alt={g.name} /> : null;
                    })}
                  </div>
                  <div>
                    <span className="caption">{friendlyDate(r.date)}</span>
                    <h3>{r.note || '나의 하루 코디'}</h3>
                    <span className={`record-status ${r.status}`}>
                      {r.status === 'planned' ? '입을 예정' : '사용자 기록'}
                    </span>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <CalendarDays size={24} />
              <p>아직 기록된 하루가 없어요.</p>
              <Link href="/records" className="text-button">
                첫 기록 남기기
                <Plus size={14} />
              </Link>
            </div>
          )}
          <Link className="insight-teaser" href="/insights">
            <span>MY WARDROBE STORY</span>
            <h3>
              자주 입는 옷부터
              <br />
              잊고 있던 옷까지.
            </h3>
            <span>
              옷장 돌아보기
              <ArrowRight size={15} />
            </span>
          </Link>
        </section>
      </div>
    </>
  );
}
