'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, ScanLine, Check, ArrowDown } from 'lucide-react';
import type { Garment, PurchaseResult } from '@/lib/types';
import { localDate, uid } from '@/lib/utils';
import { wardrobeApi } from '@/lib/mock-api';
import { useWardrobe } from './store';
import { GarmentFields, ImagePicker } from './wardrobe';
import {
  Empty,
  ErrorBox,
  GarmentCard,
  GarmentImage,
  Loading,
  MockLabel,
  OutfitCollage,
  PageHeading,
  SectionHeading,
} from './ui';
export function Purchase() {
  const { state, update, notify } = useWardrobe();
  const router = useRouter();
  const [image, setImage] = useState(''),
    [values, setValues] = useState<Pick<Garment, 'name' | 'category' | 'color' | 'style'>>({
      name: '구매 예정 의류',
      category: '상의',
      color: '잘 모르겠어요',
      style: '캐주얼',
    });
  const [productId] = useState(() => uid('purchase'));
  const [product, setProduct] = useState<Garment | null>(null),
    [result, setResult] = useState<PurchaseResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setResult(null);
  }, [state.garments]);
  async function analyze() {
    if (!image) return;
    if (!values.name.trim()) {
      setError('상품 이름을 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const next: Garment = {
      id: productId,
      ...values,
      name: values.name.trim(),
      image,
      excluded: false,
      source: 'upload',
      createdAt: localDate(),
    };
    setProduct(next);
    try {
      setResult(await wardrobeApi.analyzePurchase(state.garments, next));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add() {
    if (!product) return;
    if (
      update((s) => ({
        ...s,
        garments: s.garments.some((g) => g.id === product.id)
          ? s.garments
          : [product, ...s.garments],
      }))
    ) {
      notify('구매한 옷을 내 옷장에 추가했어요.');
      router.push(`/wardrobe/${product.id}`);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BEFORE YOU BUY"
        title="이 옷, 내 옷장에 어떨까요?"
        description="비슷한 옷부터 새롭게 생기는 조합까지, 사기 전에 살펴보세요."
      />
      {!result && !busy ? (
        <div className="editor-layout">
          <ImagePicker
            image={image}
            onChange={(next, sample) => {
              setImage(next);
              setError('');
              if (sample)
                setValues({
                  name: sample.name + ' (구매 예정)',
                  category: sample.category,
                  color: sample.color,
                  style: sample.style,
                });
            }}
          />
          <section className="editor-panel">
            <MockLabel>구매분석 체험</MockLabel>
            <h2>
              마음에 든 옷,
              <br />내 옷과 함께 상상해요.
            </h2>
            <p className="subtle">
              상품 사진과 정보를 준비해주세요. 모든 분석 결과와 숫자는 예시 데이터예요.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void analyze();
              }}
            >
              <GarmentFields
                value={values}
                onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              />
              {error && <ErrorBox message={error} />}
              <button className="button primary full" disabled={!image}>
                <ScanLine size={18} />내 옷장과 비교하기
              </button>
            </form>
          </section>
        </div>
      ) : busy ? (
        <Loading text="내 옷장과 함께 살펴보고 있어요" />
      ) : result && product ? (
        <>
          <div className="purchase-result-header">
            <div className="purchase-product">
              <GarmentImage item={product} />
              <div>
                <p className="eyebrow">WARDROBE UTILITY</p>
                <h2>{product.name}</h2>
                <p className="subtle">
                  {product.category} · {product.color}
                </p>
                <MockLabel>전체 결과·숫자는 예시 데이터</MockLabel>
              </div>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                setResult(null);
                setError('');
              }}
            >
              다른 상품 분석
            </button>
          </div>
          <section className="utility-panel">
            <div className="section-heading">
              <h2>새 옷이 더해주는 가능성</h2>
              <span className="caption">실제 AI 모델 미검증</span>
            </div>
            <div className="utility-equation">
              <div>
                <strong>{result.possible}</strong>
                <span>상품 포함 조합</span>
              </div>
              <span className="equation-sign">−</span>
              <div>
                <strong>{result.replaceable}</strong>
                <span>기존 옷 대체 조합</span>
              </div>
              <span className="equation-sign">=</span>
              <div className="utility-added">
                <strong>{result.additional}</strong>
                <span>실질 신규 조합 예시</span>
              </div>
            </div>
            <p>
              가능한 모든 조합이 새로운 코디는 아니에요. 기존 옷으로도 만들 수 있는 조합은 구분해서
              봐요.
            </p>
            <p className="caption">
              최대 6개의 체험 조합으로 개념을 설명하는 예시입니다. 전체 옷장의 Utility 계산이나 구매
              권장 점수가 아니에요.
            </p>
          </section>
          <section className="purchase-section">
            <SectionHeading title="비슷한 옷, 이미 가지고 있나요?" />
            {result.similar.length ? (
              <>
                <p className="subtle">
                  같은 카테고리의 비교 예시예요. 실제 이미지 유사도나 대체 가능성을 검증한 결과는
                  아니에요.
                </p>
                <div className="purchase-similar-grid">
                  {result.similar.map((g) => (
                    <GarmentCard key={g.id} item={g} />
                  ))}
                </div>
              </>
            ) : (
              <div className="quiet-empty">현재 옷장에 같은 카테고리의 옷이 없어요.</div>
            )}
          </section>
          <section className="purchase-section">
            <SectionHeading title="함께 활용할 내 옷" />
            {result.partners.length ? (
              <div className="partner-list">
                {result.partners.map((g) => (
                  <Link key={g.id} href={`/wardrobe/${g.id}`}>
                    <GarmentImage item={g} />
                    <span>{g.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title="함께 조합할 옷이 더 필요해요"
                description="상의·하의·신발을 등록하면 구매 예정 상품과의 코디 예시를 볼 수 있어요."
                href="/wardrobe/new"
              />
            )}
          </section>
          <section className="purchase-section">
            <SectionHeading title="상품을 고정한 코디 미리보기" />
            {result.outfits.length ? (
              <div className="purchase-outfits">
                {result.outfits.map(({ outfit, replaceableBy }, i) => (
                  <article key={outfit.id}>
                    <OutfitCollage outfit={outfit} items={[...state.garments, product]} />
                    <div className="purchase-outfit-copy">
                      <span className={`tag ${replaceableBy ? '' : 'sage'}`}>
                        {replaceableBy ? '기존 옷으로 대체 가능 · 예시' : '실질 신규 조합 · 예시'}
                      </span>
                      <h3>구매 상품 활용 LOOK {i + 1}</h3>
                      <p className="caption">
                        {replaceableBy
                          ? `${state.garments.find((g) => g.id === replaceableBy)?.name}로 바꾼 경우를 보여주는 예시예요.`
                          : '기존 옷으로 대체되지 않는 경우를 보여주는 예시예요.'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="subtle">
                현재 옷장으로는 완성된 조합을 만들지 못했어요. 신규 조합 0을 ‘활용 가치 없음’으로
                단정하지 않아요.
              </p>
            )}
          </section>
          <div className="purchase-footer">
            <p>실제로 구매했다면 옷장에 추가해보세요.</p>
            {state.garments.some((g) => g.id === product.id) ? (
              <Link href={`/wardrobe/${product.id}`} className="button secondary">
                <Check size={16} />
                옷장에서 보기
              </Link>
            ) : (
              <button className="button primary" onClick={add}>
                <Plus size={17} />
                구매했어요 · 옷장에 추가
              </button>
            )}
            <Link href="/" className="button secondary">
              HOME으로
              <ArrowRight size={16} />
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}
