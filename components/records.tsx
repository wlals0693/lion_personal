'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Check, Pencil, Trash2, CalendarDays } from 'lucide-react';
import type { WearRecord } from '@/lib/types';
import { friendlyDate, localDate, toggleValue, uid } from '@/lib/utils';
import { useWardrobe } from './store';
import { Empty, ErrorBox, GarmentImage, Modal, PageHeading } from './ui';
export function Records() {
  const { state, update, notify } = useWardrobe();
  const params = useSearchParams();
  const target = state.records.find((r) => r.id === params.get('edit'));
  const [selected, setSelected] = useState(target?.date || localDate()),
    [month, setMonth] = useState((target?.date || localDate()).slice(0, 7)),
    [draft, setDraft] = useState<WearRecord | null>(target || null),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState<string | null>(null);
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5)) - 1;
  const start = new Date(year, monthIndex, 1).getDay();
  const length = new Date(year, monthIndex + 1, 0).getDate();
  const daily = state.records.filter((r) => r.date === selected);
  function shift(delta: number) {
    const date = new Date(year, monthIndex + delta, 1);
    setMonth(localDate(date).slice(0, 7));
  }
  function newRecord() {
    setError('');
    setDraft({ id: uid('wear'), date: selected, itemIds: [], status: 'recorded', note: '' });
  }
  function save() {
    if (!draft) return;
    if (!draft.itemIds.length) {
      setError('기록할 옷을 하나 이상 선택해주세요.');
      return;
    }
    if (draft.status === 'recorded' && draft.date > localDate()) {
      setError('미래 날짜는 ‘입을 예정’으로 저장해주세요.');
      return;
    }
    if (
      update((s) => ({
        ...s,
        records: s.records.some((r) => r.id === draft.id)
          ? s.records.map((r) => (r.id === draft.id ? draft : r))
          : [draft, ...s.records],
      }))
    ) {
      setSelected(draft.date);
      setMonth(draft.date.slice(0, 7));
      setDraft(null);
      notify('기록을 저장했어요.');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="DAYS IN YOUR WARDROBE"
        title="차곡차곡, 나의 착용 기록"
        description="입을 계획과 직접 남긴 착용 기록을 구분해서 보관해요."
        action={
          <button className="button primary" onClick={newRecord}>
            <Plus size={17} />
            기록 추가
          </button>
        }
      />
      <div className="records-layout">
        <section className="calendar">
          <div className="calendar-header">
            <button className="icon-button" onClick={() => shift(-1)} aria-label="이전 달">
              <ChevronLeft size={20} />
            </button>
            <h2>
              {year}년 {monthIndex + 1}월
            </h2>
            <button className="icon-button" onClick={() => shift(1)} aria-label="다음 달">
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="calendar-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span className="weekday" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const has = state.records.some((r) => r.date === date);
              return (
                <button
                  className={`calendar-day ${date === selected ? 'selected' : ''} ${date === localDate() ? 'today' : ''}`}
                  key={date}
                  onClick={() => {
                    setSelected(date);
                  }}
                  aria-label={`${date}${has ? ' 기록 있음' : ''}`}
                  aria-pressed={date === selected}
                >
                  <span>{i + 1}</span>
                  {has && <i />}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span className="status-dot" />
            기록이 있는 날<span>예정 기록도 포함</span>
          </div>
        </section>
        <section className="daily-records">
          <div className="section-heading">
            <h2>{friendlyDate(selected)}</h2>
            <span className="caption">{daily.length}개</span>
          </div>
          {daily.length ? (
            daily.map((record) => (
              <article className="daily-record" key={record.id}>
                <div className="section-heading">
                  <span className={`record-status ${record.status}`}>
                    {record.status === 'planned' ? '입을 예정' : '사용자가 남긴 착용 기록'}
                  </span>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label="기록 수정"
                      onClick={() => {
                        setDraft(record);
                        setError('');
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="기록 삭제"
                      onClick={() => setDeleting(record.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="record-clothes">
                  {record.itemIds.map((id) => {
                    const g = state.garments.find((g) => g.id === id);
                    return g ? <GarmentImage item={g} key={id} /> : null;
                  })}
                </div>
                {!record.itemIds.length && (
                  <p className="caption">이 기록의 의류가 옷장에서 삭제되었어요.</p>
                )}
                <p>{record.note || '메모 없는 하루'}</p>
                {record.status === 'planned' && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraft({ ...record, status: 'recorded' });
                      setError('');
                    }}
                  >
                    <Check size={15} />
                    직접 착용 기록으로 남기기
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="quiet-empty">
              <CalendarDays size={30} strokeWidth={1.3} />
              <h3>이날은 아직 기록이 없어요</h3>
              <button className="text-button" onClick={newRecord}>
                기록 남기기
                <Plus size={14} />
              </button>
            </div>
          )}
        </section>
      </div>
      {draft && (
        <section className="record-editor" id="record-editor">
          <div className="section-heading">
            <h2>{state.records.some((r) => r.id === draft.id) ? '기록 수정' : '새 기록 남기기'}</h2>
            <button className="text-button" onClick={() => setDraft(null)}>
              닫기
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="form-columns">
              <label className="field">
                날짜
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label className="field">
                기록 종류
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as WearRecord['status'] })
                  }
                >
                  <option value="planned">입을 예정</option>
                  <option value="recorded">직접 남기는 착용 기록</option>
                </select>
              </label>
            </div>
            <p className="caption">직접 남기는 기록이며 자동 착용 감지가 아니에요.</p>
            <fieldset>
              <legend>기록할 옷 선택</legend>
              {state.garments.length ? (
                <div className="record-select-grid">
                  {state.garments.map((g) => (
                    <button
                      className={`record-select ${draft.itemIds.includes(g.id) ? 'selected' : ''}`}
                      type="button"
                      key={g.id}
                      aria-pressed={draft.itemIds.includes(g.id)}
                      onClick={() =>
                        setDraft({ ...draft, itemIds: toggleValue(draft.itemIds, g.id) })
                      }
                    >
                      <GarmentImage item={g} />
                      <span>{g.name}</span>
                      {draft.itemIds.includes(g.id) && <Check size={17} />}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="기록할 옷이 없어요"
                  description="옷부터 등록해보세요."
                  href="/wardrobe/new"
                />
              )}
            </fieldset>
            <label className="field">
              메모
              <textarea
                maxLength={160}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="오늘의 상황이나 느낌을 남겨보세요"
                rows={2}
              />
            </label>
            {error && <ErrorBox message={error} />}
            <div className="button-row">
              <button className="button secondary" type="button" onClick={() => setDraft(null)}>
                취소
              </button>
              <button className="button primary">
                <Check size={16} />
                기록 저장
              </button>
            </div>
          </form>
        </section>
      )}
      {deleting && (
        <Modal title="이 기록을 삭제할까요?" onClose={() => setDeleting(null)}>
          <p className="subtle">옷장에 등록된 옷은 그대로 남아요.</p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setDeleting(null)}>
              취소
            </button>
            <button
              className="button danger"
              onClick={() => {
                if (
                  update((s) => ({ ...s, records: s.records.filter((r) => r.id !== deleting) }))
                ) {
                  if (draft?.id === deleting) setDraft(null);
                  setDeleting(null);
                  notify('기록을 삭제했어요.');
                }
              }}
            >
              삭제하기
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
