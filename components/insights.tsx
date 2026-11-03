'use client';
import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';
import { categories } from '@/lib/types';
import { localDate } from '@/lib/utils';
import { useWardrobe } from './store';
import { Empty, GarmentImage, PageHeading, SectionHeading } from './ui';
export function Insights() {
  const { state } = useWardrobe();
  const records = state.records.filter((r) => r.status === 'recorded');
  const counts = state.garments
    .map((g) => ({ item: g, count: records.filter((r) => r.itemIds.includes(g.id)).length }))
    .sort((a, b) => b.count - a.count);
  const before = new Date();
  before.setDate(before.getDate() - 30);
  const old = localDate(before);
  const unused = state.garments
    .filter(
      (g) =>
        !records.some((r) => r.date >= old && r.date <= localDate() && r.itemIds.includes(g.id)),
    )
    .slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="A CLOSER LOOK"
        title="내 옷장의 이야기"
        description="실제 착용 횟수 대신, 사용자가 남긴 기록을 기준으로 살펴봐요."
        back="/"
      />
      {!state.garments.length ? (
        <Empty
          title="옷장이 채워지면 이야기도 시작돼요"
          description="옷을 등록하고 착용 기록을 남겨보세요."
          href="/wardrobe/new"
        />
      ) : (
        <>
          <div className="insight-intro">
            <div>
              <p className="eyebrow">LESS BUYING, MORE WEARING</p>
              <h2>
                {state.garments.length}벌의 옷,
                <br />더 많은 가능성.
              </h2>
            </div>
            <p>
              좋아하는 옷은 더 자주,
              <br />
              잊고 있던 옷은 새롭게 만나보세요.
            </p>
          </div>
          <section className="insight-section">
            <SectionHeading title="카테고리별 옷장" />
            <div className="category-bars">
              {categories.map((c) => {
                const count = state.garments.filter((g) => g.category === c).length;
                return (
                  <div className="category-bar-row" key={c}>
                    <span>{c}</span>
                    <div className="category-bar-track">
                      <div style={{ width: `${(count / state.garments.length) * 100}%` }} />
                    </div>
                    <strong>{count}벌</strong>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="insight-section">
            <SectionHeading title="착용 기록에 자주 등장한 옷" href="/records" label="기록 보기" />
            {records.length ? (
              <div className="insight-items">
                {counts
                  .filter((g) => g.count > 0)
                  .slice(0, 3)
                  .map(({ item, count }, i) => (
                    <Link className="ranked-item" href={`/wardrobe/${item.id}`} key={item.id}>
                      <span className="rank">0{i + 1}</span>
                      <GarmentImage item={item} />
                      <div>
                        <h3>{item.name}</h3>
                        <span className="caption">사용자 착용 기록 {count}회</span>
                      </div>
                      <ArrowRight size={16} />
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="quiet-empty">
                아직 직접 남긴 착용 기록이 없어요. ‘입을 예정’은 집계하지 않아요.
              </p>
            )}
          </section>
          <section className="insight-section">
            <SectionHeading title="최근 30일, 기록에 없는 옷" />
            <p className="subtle">
              안 입었다는 뜻은 아니에요. 기록이 없는 옷의 다른 조합을 발견해보세요.
            </p>
            <div className="rediscover-grid">
              {unused.map((g) => (
                <article key={g.id}>
                  <Link href={`/wardrobe/${g.id}`}>
                    <GarmentImage item={g} />
                  </Link>
                  <h3>{g.name}</h3>
                  {g.excluded ? (
                    <Link className="text-button" href={`/wardrobe/${g.id}`}>
                      추천 제외 상태 확인
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <Link className="text-button" href={`/outfits?anchor=${g.id}`}>
                      <Layers size={14} />이 옷 다시 코디하기
                    </Link>
                  )}
                </article>
              ))}
            </div>
            {!unused.length && (
              <p className="quiet-empty">모든 옷에 최근 착용 기록이 남아 있어요.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
