import { initialState } from './seed';
import type { WardrobeState } from './types';
const KEY = 'ai-wardrobe-prototype:v1';
export interface WardrobeRepository {
  load(): WardrobeState;
  save(state: WardrobeState): void;
  clear(): void;
}
// Swap this adapter for Supabase / a FastAPI client. UI never reads localStorage.
export const wardrobeRepository: WardrobeRepository = {
  load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    try {
      const state = JSON.parse(raw);
      if (
        state.version !== 1 ||
        !Array.isArray(state.garments) ||
        !Array.isArray(state.records) ||
        !Array.isArray(state.likes) ||
        !state.profile ||
        !Array.isArray(state.profile.styles) ||
        !Array.isArray(state.profile.colors)
      )
        throw new Error();
      return state as WardrobeState;
    } catch {
      throw new Error(
        '저장된 체험 데이터를 읽지 못했어요. 초기화하면 예시 옷장으로 다시 시작할 수 있어요.',
      );
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error(
        '이 브라우저의 저장 공간이 부족해요. 등록한 사진을 줄이거나 브라우저 저장 설정을 확인해주세요. 변경 사항은 저장되지 않았어요.',
      );
    }
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
