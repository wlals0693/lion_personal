'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Sparkles,
  Pencil,
  EyeOff,
  Trash2,
  Layers,
  Check,
  ImagePlus,
  LoaderCircle,
  Search,
} from 'lucide-react';
import { categories, colors, styles, type Garment, type Category } from '@/lib/types';
import { localDate, uid } from '@/lib/utils';
import { readPhoto, wardrobeApi } from '@/lib/mock-api';
import { sampleGarments } from '@/lib/seed';
import { useWardrobe } from './store';
import {
  AddButton,
  Empty,
  ErrorBox,
  GarmentCard,
  GarmentImage,
  MockLabel,
  Modal,
  PageHeading,
} from './ui';

export function Wardrobe() {
  const { state } = useWardrobe();
  const [category, setCategory] = useState('전체'),
    [search, setSearch] = useState('');
  const filtered = state.garments.filter(
    (g) =>
      (category === '전체' || g.category === category) &&
      g.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="MY WARDROBE"
        title="나의 옷장"
        description={`지금 가진 ${state.garments.length}벌, 아직 발견하지 못한 조합들.`}
        action={<AddButton />}
      />
      <div className="wardrobe-toolbar">
        <div className="chips category-chips">
          {['전체', ...categories].map((c) => (
            <button
              className={`chip ${category === c ? 'selected' : ''}`}
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
            >
              {c}
              {c === '전체' && <span>{state.garments.length}</span>}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="의류 검색"
            placeholder="내 옷 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="garment-grid">
          {filtered.map((item) => (
            <GarmentCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <Empty
          title={state.garments.length ? '찾는 옷이 없어요' : '아직 비어 있는 옷장'}
          description={
            state.garments.length
              ? '다른 카테고리나 검색어로 찾아보세요.'
              : '자주 입는 옷 한 벌부터 등록해보세요.'
          }
          href={state.garments.length ? undefined : '/wardrobe/new'}
        />
      )}
      <Link className="insight-strip" href="/insights">
        <Sparkles size={18} />
        <span>내 옷장, 얼마나 활용하고 있을까요?</span>
        <span>옷장 분석 →</span>
      </Link>
    </>
  );
}
export function ImagePicker({
  image,
  onChange,
  disabled = false,
}: {
  image: string;
  onChange: (image: string, sample?: Garment) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function fileChanged(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await readPhoto(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="photo-picker">
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="의류 사진 선택"
        disabled={disabled || busy}
        onChange={(e) => void fileChanged(e.target.files?.[0])}
      />
      {image ? (
        <div className="photo-preview">
          <GarmentImage item={{ image, name: '선택한 의류 사진' }} />
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
            type="button"
            disabled={disabled || busy}
          >
            <ImagePlus size={16} />
            사진 바꾸기
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="upload-zone"
          onClick={() => input.current?.click()}
          disabled={disabled || busy}
        >
          <span className="upload-icon">
            {busy ? (
              <LoaderCircle className="spin" size={25} />
            ) : (
              <Upload size={25} strokeWidth={1.4} />
            )}
          </span>
          <strong>{busy ? '사진을 준비하고 있어요' : '사진을 올려주세요'}</strong>
          <span>갤러리에서 옷 사진 선택</span>
          <small>JPG, PNG, WebP · 최대 12MB</small>
        </button>
      )}
      {error && <ErrorBox message={error} />}
      <div className="sample-picker">
        <p className="caption">사진이 없다면 예시로 체험해보세요</p>
        <div>
          {sampleGarments()
            .filter((g) => ['t003', 'b005', 's002'].includes(g.id))
            .map((g) => (
              <button
                type="button"
                key={g.id}
                disabled={disabled || busy}
                onClick={() => {
                  setError('');
                  onChange(g.image, g);
                }}
                aria-label={`${g.name} 예시 사진 선택`}
              >
                <img src={g.image} alt={g.name} />
                <span>{g.category}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
export function GarmentFields({
  value,
  onChange,
}: {
  value: Pick<Garment, 'name' | 'category' | 'color' | 'style'>;
  onChange: (patch: Partial<Garment>) => void;
}) {
  return (
    <div className="garment-fields">
      <label className="field">
        옷 이름
        <input
          value={value.name}
          maxLength={60}
          required
          placeholder="예: 자주 입는 데님 셔츠"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <div className="form-columns">
        <label className="field">
          카테고리
          <select
            value={value.category}
            onChange={(e) => onChange({ category: e.target.value as Category })}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          주 색상
          <select value={value.color} onChange={(e) => onChange({ color: e.target.value })}>
            {colors.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        스타일
        <select value={value.style} onChange={(e) => onChange({ style: e.target.value })}>
          {[...styles, '잘 모르겠어요'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function GarmentEditor({ id }: { id?: string }) {
  const { state, update, notify } = useWardrobe();
  const router = useRouter();
  const existing = state.garments.find((g) => g.id === id);
  const [image, setImage] = useState(existing?.image || '');
  const [values, setValues] = useState({
    name: existing?.name || '',
    category: existing?.category || ('상의' as Category),
    color: existing?.color || '잘 모르겠어요',
    style: existing?.style || '캐주얼',
  });
  const [stage, setStage] = useState(existing ? 'review' : 'upload'),
    [error, setError] = useState('');
  if (id && !existing)
    return (
      <Empty
        title="옷을 찾을 수 없어요"
        description="삭제되었거나 잘못된 주소예요."
        href="/wardrobe"
        label="옷장으로"
      />
    );
  async function analyze() {
    setStage('loading');
    setError('');
    try {
      const analysis = await wardrobeApi.analyzeImage(image, values.category);
      setValues((v) => ({ ...analysis, name: v.name || analysis.name }));
      setStage('review');
    } catch (e) {
      setError((e as Error).message);
      setStage('upload');
    }
  }
  function save() {
    if (!values.name.trim()) {
      setError('옷 이름을 입력해주세요.');
      return;
    }
    const garment: Garment = {
      id: existing?.id || uid('garment'),
      ...values,
      name: values.name.trim(),
      image,
      excluded: existing?.excluded || false,
      source: existing?.source || 'upload',
      createdAt: existing?.createdAt || localDate(),
    };
    if (
      update((s) => ({
        ...s,
        garments: existing
          ? s.garments.map((g) => (g.id === id ? garment : g))
          : [garment, ...s.garments],
      }))
    ) {
      notify(existing ? '옷 정보를 수정했어요.' : '옷장에 새 옷을 걸었어요.');
      router.push(`/wardrobe/${garment.id}`);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ADD TO YOUR WARDROBE"
        title={existing ? '옷 정보 수정' : '새로운 옷 등록'}
        description="사진 한 장으로 시작하고, 필요한 정보만 확인해요."
        back={existing ? `/wardrobe/${id}` : '/wardrobe'}
      />
      <div className="registration-steps">
        <span className="active">01 사진 선택</span>
        <span className={stage === 'review' ? 'active' : ''}>02 정보 확인</span>
        <span>03 옷장에 저장</span>
      </div>
      <div className="editor-layout">
        <ImagePicker
          image={image}
          disabled={stage === 'loading'}
          onChange={(next, sample) => {
            setImage(next);
            setStage(existing ? 'review' : 'upload');
            setError('');
            if (sample)
              setValues({
                name: sample.name,
                category: sample.category,
                color: sample.color,
                style: sample.style,
              });
          }}
        />
        <section className="editor-panel">
          {stage === 'loading' ? (
            <div className="state-box" role="status">
              <Sparkles className="spin" />
              <h2>특징 후보를 준비하고 있어요</h2>
              <p className="subtle">실제 사진 분석이 아닌 체험용 응답이에요.</p>
            </div>
          ) : stage === 'upload' ? (
            <>
              <p className="eyebrow">ONE PIECE AT A TIME</p>
              <h2>
                자주 입는 옷부터,
                <br />
                하나씩 가볍게.
              </h2>
              <p className="subtle">
                옷 전체가 보이는 사진이면 좋아요.
                <br />
                배경이 있어도 등록할 수 있어요.
              </p>
              <label className="field">
                어느 칸에 넣을까요?
                <select
                  value={values.category}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, category: e.target.value as Category }))
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <MockLabel>AI 분석 체험 · 실제 모델 미연결</MockLabel>
              {error && <ErrorBox message={error} retry={() => void analyze()} />}
              <button
                className="button primary full"
                disabled={!image}
                onClick={() => void analyze()}
              >
                <Sparkles size={17} />
                특징 후보 확인하기
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="section-heading">
                <h2>이렇게 등록할까요?</h2>
                <MockLabel>예시 응답</MockLabel>
              </div>
              <p className="subtle">
                실제 AI 분석 결과가 아니에요. 사진에 맞게 바꿔주세요. 색상이 애매하면 ‘잘
                모르겠어요’로 남겨도 돼요.
              </p>
              <GarmentFields
                value={values}
                onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              />
              {error && <ErrorBox message={error} />}
              <button className="button primary full" type="submit">
                <Check size={17} />
                {existing ? '수정한 정보 저장' : '내 옷장에 저장'}
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
export function GarmentDetail({ id }: { id: string }) {
  const { state, update, notify } = useWardrobe();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const item = state.garments.find((g) => g.id === id);
  if (!item)
    return (
      <Empty
        title="옷을 찾을 수 없어요"
        description="삭제되었거나 잘못된 주소예요."
        href="/wardrobe"
        label="옷장으로"
      />
    );
  const count = state.records.filter(
    (r) => r.status === 'recorded' && r.itemIds.includes(id),
  ).length;
  function remove() {
    if (
      update((s) => ({
        ...s,
        garments: s.garments.filter((g) => g.id !== id),
        likes: s.likes.filter((l) => !l.split(':').includes(id)),
        records: s.records.map((r) => ({ ...r, itemIds: r.itemIds.filter((i) => i !== id) })),
      }))
    ) {
      notify('옷을 삭제했어요. 기존 기록의 날짜와 메모는 남겨뒀어요.');
      router.push('/wardrobe');
    }
  }
  return (
    <>
      <PageHeading eyebrow="GARMENT DETAILS" title="내 옷 자세히 보기" back="/wardrobe" />
      <div className="garment-detail">
        <GarmentImage item={item} />
        <section>
          <span className="eyebrow">{item.category}</span>
          <h1>{item.name}</h1>
          <div className="chips">
            <span className="tag">{item.color}</span>
            <span className="tag">{item.style}</span>
            {item.excluded && <span className="tag">추천 제외 중</span>}
          </div>
          <dl className="detail-list">
            <div>
              <dt>옷장에 들어온 날</dt>
              <dd>{item.createdAt}</dd>
            </div>
            <div>
              <dt>사용자가 남긴 착용 기록</dt>
              <dd>{count}회</dd>
            </div>
            <div>
              <dt>등록 정보</dt>
              <dd>{item.source === 'sample' ? '예시 의류' : '사용자 등록·확인'}</dd>
            </div>
          </dl>
          <Link
            className={`button primary full ${item.excluded ? 'disabled-link' : ''}`}
            aria-disabled={item.excluded}
            href={item.excluded ? '#' : `/outfits?anchor=${id}`}
          >
            <Layers size={18} />이 옷으로 코디 추천
          </Link>
          {item.excluded && (
            <p className="caption">추천 제외를 해제하면 이 옷을 고정할 수 있어요.</p>
          )}
          <div className="detail-actions">
            <Link className="button secondary" href={`/wardrobe/${id}/edit`}>
              <Pencil size={16} />
              수정
            </Link>
            <button
              className="button secondary"
              onClick={() => {
                if (
                  update((s) => ({
                    ...s,
                    garments: s.garments.map((g) =>
                      g.id === id ? { ...g, excluded: !g.excluded } : g,
                    ),
                  }))
                )
                  notify(item.excluded ? '추천에 다시 포함했어요.' : '추천에서 제외했어요.');
              }}
            >
              <EyeOff size={16} />
              {item.excluded ? '제외 해제' : '추천 제외'}
            </button>
            <button className="button danger-ghost" onClick={() => setDeleting(true)}>
              <Trash2 size={16} />
              삭제
            </button>
          </div>
        </section>
      </div>
      {deleting && (
        <Modal title="이 옷을 삭제할까요?" onClose={() => setDeleting(false)}>
          <p className="subtle">
            옷장과 추천에서 사라져요. 기존 착용 기록에서는 이 옷만 빠지고 날짜와 메모는 남아요.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setDeleting(false)}>
              취소
            </button>
            <button className="button danger" onClick={remove}>
              삭제하기
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
