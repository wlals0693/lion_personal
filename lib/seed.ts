import type { Garment, WardrobeState } from './types';
import { localDate } from './utils';
const samples: [string, string, Garment['category'], string, string][] = [
  ['t001', '차콜 그래픽 티셔츠', '상의', '차콜', '스트리트'],
  ['t002', '화이트 로고 티셔츠', '상의', '화이트', '캐주얼'],
  ['t003', '인디고 데님 셔츠', '상의', '네이비', '캐주얼'],
  ['t004', '네이비 메시 저지', '상의', '네이비', '스포티'],
  ['b001', '워시드 벌룬 데님', '하의', '차콜', '캐주얼'],
  ['b003', '차콜 밴딩 쇼츠', '하의', '차콜', '캐주얼'],
  ['b004', '그래픽 패턴 쇼츠', '하의', '그레이', '스트리트'],
  ['b005', '블랙 와이드 슬랙스', '하의', '블랙', '미니멀'],
  ['s001', '브라운 로우 스니커즈', '신발', '브라운', '캐주얼'],
  ['s002', '화이트 배색 스니커즈', '신발', '화이트', '캐주얼'],
  ['s003', '아이보리 폼 슬립온', '신발', '베이지', '스트리트'],
  ['s004', '블랙 레이스업 슈즈', '신발', '블랙', '클래식'],
];
export function sampleGarments(): Garment[] {
  return samples.map(([id, name, category, color, style]) => ({
    id,
    name,
    category,
    color,
    style,
    image: `/clothes/${id}.jpg`,
    excluded: false,
    source: 'sample',
    createdAt: '2026-10-01',
  }));
}
export function initialState(): WardrobeState {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const earlier = new Date();
  earlier.setDate(earlier.getDate() - 4);
  return {
    version: 1,
    loggedIn: false,
    onboarded: false,
    profile: {
      nickname: '지민',
      styles: ['캐주얼', '미니멀'],
      colors: ['화이트', '차콜'],
      region: '서울',
    },
    garments: sampleGarments(),
    likes: [],
    records: [
      {
        id: 'sample-record-1',
        date: localDate(yesterday),
        itemIds: ['t002', 'b005', 's002'],
        status: 'recorded',
        note: '친구와 카페 · 예시 기록',
      },
      {
        id: 'sample-record-2',
        date: localDate(earlier),
        itemIds: ['t003', 'b001', 's001'],
        status: 'recorded',
        note: '가벼운 외출 · 예시 기록',
      },
    ],
  };
}
