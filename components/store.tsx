'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WardrobeState } from '@/lib/types';
import { initialState } from '@/lib/seed';
import { wardrobeRepository } from '@/lib/repository';

interface Store {
  state: WardrobeState;
  ready: boolean;
  error: string;
  update: (transform: (state: WardrobeState) => WardrobeState) => boolean;
  notify: (message: string) => void;
  reset: () => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WardrobeState>(initialState);
  const current = useRef(state);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  useEffect(() => {
    try {
      const loaded = wardrobeRepository.load();
      current.current = loaded;
      setState(loaded);
    } catch (e) {
      setError((e as Error).message);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function update(transform: (s: WardrobeState) => WardrobeState) {
    const next = transform(current.current);
    // An edited, deleted or excluded garment invalidates its previous AI judgement.
    if (next.garments !== current.current.garments) {
      next.evaluatedOutfits = (next.evaluatedOutfits || []).filter((o) =>
        o.itemIds.every((id) => {
          const before = current.current.garments.find((g) => g.id === id);
          const after = next.garments.find((g) => g.id === id);
          return (
            before && after && !after.excluded && JSON.stringify(before) === JSON.stringify(after)
          );
        }),
      );
    }
    try {
      wardrobeRepository.save(next);
      current.current = next;
      setState(next);
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  }
  function reset() {
    try {
      wardrobeRepository.clear();
      const fresh = initialState();
      current.current = fresh;
      setState(fresh);
      setError('');
      setToast('체험 데이터를 초기화했어요.');
    } catch {
      setToast('브라우저 저장 설정을 확인해주세요.');
    }
  }
  return (
    <Context.Provider value={{ state, ready, error, update, notify: setToast, reset }}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast('')} aria-label="알림 닫기">
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useWardrobe() {
  const value = useContext(Context);
  if (!value) throw new Error('StoreProvider missing');
  return value;
}
