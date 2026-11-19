'use client';
import { useEffect, useRef, useState } from 'react';
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
import {
  categories,
  colors,
  styles,
  garmentTypes,
  categoryForType,
  sleeveTypes,
  type Garment,
  type Category,
  type GarmentType,
  type SleeveType,
} from '@/lib/types';
import { analyzeGarment } from '@/lib/garment-analysis';
import { localDate, uid } from '@/lib/utils';
import { readPhoto, wardrobeApi } from '@/lib/mock-api';
import { sampleGarments } from '@/lib/seed';
import { useWardrobe } from './store';
import { AddButton, Empty, ErrorBox, GarmentCard, GarmentImage, Modal, PageHeading } from './ui';

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
interface PhotoUpload {
  file: File;
  clickedAt: number;
  selectedAt: number;
}
const analysisFieldLabels: Record<string, string> = {
  name: '옷 이름',
  type: '옷 종류',
  sleeve: '소매',
  color: '색상',
  style: '스타일',
  pattern: '패턴',
  neckline: '목 형태',
  materialGuess: '원단 추정',
};
export function ImagePicker({
  image,
  onChange,
  disabled = false,
}: {
  image: string;
  onChange: (image: string, sample?: Garment, upload?: PhotoUpload) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadClickedAt = useRef<number | null>(null);
  function pickPhoto() {
    uploadClickedAt.current = performance.now();
    input.current?.click();
  }
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function fileChanged(file?: File) {
    if (!file) return;
    const selectedAt = performance.now();
    const clickedAt = uploadClickedAt.current ?? selectedAt;
    setBusy(true);
    setError('');
    try {
      onChange(await readPhoto(file), undefined, { file, clickedAt, selectedAt });
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
            onClick={pickPhoto}
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
          onClick={pickPhoto}
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
  value: Pick<
    Garment,
    | 'name'
    | 'category'
    | 'color'
    | 'style'
    | 'type'
    | 'sleeve'
    | 'pattern'
    | 'neckline'
    | 'materialGuess'
    | 'uncertainFields'
  >;
  onChange: (patch: Partial<Garment>) => void;
}) {
  return (
    <div className="garment-fields">
      <div className="form-columns">
        <label className="field">
          옷 종류
          <select
            aria-label="옷 종류"
            value={value.type || 'unknown'}
            onChange={(e) => onChange({ type: e.target.value as GarmentType })}
          >
            {Object.entries(garmentTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          소매
          <select
            aria-label="소매"
            value={value.sleeve || 'unknown'}
            onChange={(e) => onChange({ sleeve: e.target.value as SleeveType })}
          >
            {Object.entries(sleeveTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
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
            aria-label="카테고리"
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
          <select
            aria-label="주 색상"
            value={value.color}
            onChange={(e) => onChange({ color: e.target.value })}
          >
            {[...new Set([...colors, value.color])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        스타일
        <select
          aria-label="스타일"
          value={value.style}
          onChange={(e) => onChange({ style: e.target.value })}
        >
          {[...styles, '잘 모르겠어요'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className="form-columns">
        <label className="field">
          패턴
          <input
            aria-label="패턴"
            value={value.pattern || ''}
            maxLength={100}
            placeholder="잘 모르겠어요"
            onChange={(e) => onChange({ pattern: e.target.value })}
          />
        </label>
        <label className="field">
          목 형태
          <input
            aria-label="목 형태"
            value={value.neckline || ''}
            maxLength={100}
            placeholder="잘 모르겠어요"
            onChange={(e) => onChange({ neckline: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        원단 추정
        <input
          aria-label="원단 추정"
          value={value.materialGuess || ''}
          maxLength={100}
          placeholder="잘 모르겠어요"
          onChange={(e) => onChange({ materialGuess: e.target.value })}
        />
        <small>사진으로 본 추정이에요. 실제 섬유 성분은 라벨에서 확인해주세요.</small>
      </label>
      {!!value.uncertainFields?.length && (
        <p className="caption" data-testid="uncertain-fields">
          확인이 필요한 항목:{' '}
          {value.uncertainFields.map((key) => analysisFieldLabels[key] || key).join(', ')}
        </p>
      )}
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
    type: existing?.type || ('unknown' as GarmentType),
    sleeve: existing?.sleeve || ('unknown' as SleeveType),
    pattern: existing?.pattern || '',
    neckline: existing?.neckline || '',
    materialGuess: existing?.materialGuess || '',
    uncertainFields: existing?.uncertainFields || ([] as string[]),
  });
  const nameEdited = useRef(!!existing?.name);
  const selectedUpload = useRef<PhotoUpload | null>(null);
  const pendingTiming = useRef<PhotoUpload | null>(null);
  const [timing, setTiming] = useState<{
    totalMs: number;
    afterSelectionMs: number;
    inferenceMs: number;
  } | null>(null);
  const inferenceMs = useRef(0);
  const [realAnalysis, setRealAnalysis] = useState(false);
  const [stage, setStage] = useState(existing ? 'review' : 'upload'),
    [error, setError] = useState('');
  useEffect(() => {
    if (stage !== 'review' || !pendingTiming.current) return;
    // The second frame follows a paint with both populated fields visible.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const upload = pendingTiming.current;
        if (!upload) return;
        const visibleAt = performance.now();
        const measured = {
          totalMs: visibleAt - upload.clickedAt,
          afterSelectionMs: visibleAt - upload.selectedAt,
          inferenceMs: inferenceMs.current,
        };
        performance.measure('wardrobe-upload-to-visible', {
          start: upload.clickedAt,
          end: visibleAt,
        });
        setTiming(measured);
        pendingTiming.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [stage]);
  if (id && !existing)
    return (
      <Empty
        title="옷을 찾을 수 없어요"
        description="삭제되었거나 잘못된 주소예요."
        href="/wardrobe"
        label="옷장으로"
      />
    );
  async function analyze(upload = selectedUpload.current) {
    setStage('loading');
    setError('');
    try {
      setTiming(null);
      if (upload) {
        const analysis = await analyzeGarment(upload.file);
        inferenceMs.current = analysis.inferenceMs;
        pendingTiming.current = upload;
        setRealAnalysis(true);
        setValues((v) => ({
          ...v,
          type: analysis.type,
          sleeve: analysis.sleeve,
          name: nameEdited.current ? v.name : analysis.name,
          color: analysis.color,
          style: analysis.style,
          pattern: analysis.pattern,
          neckline: analysis.neckline,
          materialGuess: analysis.materialGuess,
          uncertainFields: analysis.uncertainFields,
          category: categoryForType(analysis.type, v.category),
        }));
      } else {
        const analysis = await wardrobeApi.analyzeImage(image, values.category);
        setRealAnalysis(false);
        setValues((v) => ({ ...v, ...analysis, name: v.name || analysis.name }));
      }
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
          onChange={(next, sample, upload) => {
            setImage(next);
            selectedUpload.current = upload || null;
            pendingTiming.current = null;
            setTiming(null);
            setRealAnalysis(false);
            setStage(existing ? 'review' : 'upload');
            setError('');
            if (sample)
              setValues({
                name: sample.name,
                category: sample.category,
                color: sample.color,
                style: sample.style,
                type: sample.type || 'unknown',
                sleeve: sample.sleeve || 'unknown',
                pattern: sample.pattern || '',
                neckline: sample.neckline || '',
                materialGuess: sample.materialGuess || '',
                uncertainFields: [],
              });
            if (upload) void analyze(upload);
          }}
        />
        <section className="editor-panel">
          {stage === 'loading' ? (
            <div className="state-box" role="status">
              <Sparkles className="spin" />
              <h2>
                {selectedUpload.current
                  ? '사진에서 옷의 특징을 확인하고 있어요'
                  : '예시 응답을 준비하고 있어요'}
              </h2>
              <p className="subtle">
                {selectedUpload.current
                  ? '분석이 끝나면 결과를 자동으로 채워드려요.'
                  : '예시 사진은 체험용 응답을 사용해요.'}
              </p>
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
              <p className="caption">
                사진을 올리면 이름·종류·소매·색상·스타일·패턴·목 형태·원단 추정이 자동으로 채워져요.
                예시 사진은 체험용이에요.
              </p>
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
                <span className="caption">
                  {realAnalysis ? '사진 분석 완료' : existing ? '저장된 정보' : '예시 응답'}
                </span>
              </div>
              <p className="subtle">
                {realAnalysis
                  ? '사진에서 예측한 정보를 확인하고 필요하면 바꿔주세요. 스타일은 제안이며 원단은 시각적 추정이에요.'
                  : existing
                    ? '필요한 정보를 수정해주세요.'
                    : '예시 응답이에요. 사진에 맞게 바꿔주세요.'}
              </p>
              {timing && (
                <p
                  className="caption"
                  role="status"
                  data-testid="analysis-timing"
                  data-total-ms={timing.totalMs}
                  data-selection-ms={timing.afterSelectionMs}
                  data-inference-ms={timing.inferenceMs}
                >
                  업로드 버튼 → 결과 표시 {(timing.totalMs / 1000).toFixed(2)}초 · 사진 선택 후{' '}
                  {(timing.afterSelectionMs / 1000).toFixed(2)}초
                </p>
              )}
              <GarmentFields
                value={values}
                onChange={(patch) => {
                  if ('name' in patch) nameEdited.current = true;
                  setValues((v) => ({
                    ...v,
                    ...patch,
                    uncertainFields: v.uncertainFields.filter((key) => !(key in patch)),
                  }));
                }}
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
            {item.type && <span className="tag">{garmentTypes[item.type]}</span>}
            {item.sleeve && <span className="tag">{sleeveTypes[item.sleeve]}</span>}
            <span className="tag">{item.color}</span>
            <span className="tag">{item.style}</span>
            {item.excluded && <span className="tag">추천 제외 중</span>}
          </div>
          <dl className="detail-list">
            {item.pattern && (
              <div>
                <dt>패턴</dt>
                <dd>{item.pattern}</dd>
              </div>
            )}
            {item.neckline && (
              <div>
                <dt>목 형태</dt>
                <dd>{item.neckline}</dd>
              </div>
            )}
            {item.materialGuess && (
              <div>
                <dt>원단 추정 · 성분 미확인</dt>
                <dd>{item.materialGuess}</dd>
              </div>
            )}
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
