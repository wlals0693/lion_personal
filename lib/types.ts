export const categories = ['상의', '하의', '신발', '아우터', '원피스'] as const;
export type Category = (typeof categories)[number];
export const garmentTypes = {
  t_shirt: '티셔츠',
  polo: '폴로',
  shirt: '셔츠',
  sports_jersey: '스포츠 저지',
  knit_sweater: '니트',
  sweatshirt: '맨투맨',
  tank_top: '민소매',
  hoodie: '후드',
  jacket: '재킷',
  coat: '코트',
  trousers: '바지',
  jeans: '청바지',
  shorts: '반바지',
  skirt: '치마',
  dress: '원피스',
  sneakers: '스니커즈',
  dress_shoes: '구두',
  boots: '부츠',
  sandals: '샌들',
  other: '기타',
  unknown: '잘 모르겠어요',
} as const;
export type GarmentType = keyof typeof garmentTypes;
export function categoryForType(type: GarmentType, fallback: Category): Category {
  if (['trousers', 'jeans', 'shorts', 'skirt'].includes(type)) return '하의';
  if (['sneakers', 'dress_shoes', 'boots', 'sandals'].includes(type)) return '신발';
  if (['jacket', 'coat'].includes(type)) return '아우터';
  if (type === 'dress') return '원피스';
  return ['unknown', 'other'].includes(type) ? fallback : '상의';
}
export const sleeveTypes = {
  short: '반팔',
  long: '긴팔',
  none: '민소매',
  unknown: '잘 모르겠어요',
} as const;
export type SleeveType = keyof typeof sleeveTypes;
export const styles = ['캐주얼', '미니멀', '스트리트', '클래식', '스포티', '빈티지'];
export const colors = [
  '화이트',
  '블랙',
  '차콜',
  '그레이',
  '네이비',
  '블루',
  '베이지',
  '브라운',
  '그린',
  '레드',
  '핑크',
  '옐로',
  '오렌지',
  '퍼플',
  '멀티컬러',
  '잘 모르겠어요',
];
export interface Garment {
  id: string;
  name: string;
  category: Category;
  type?: GarmentType;
  sleeve?: SleeveType;
  pattern?: string;
  neckline?: string;
  materialGuess?: string;
  uncertainFields?: string[];
  color: string;
  style: string;
  image: string;
  excluded: boolean;
  source: 'sample' | 'upload';
  createdAt: string;
}
export interface Outfit {
  id: string;
  itemIds: string[];
  occasion: string;
  title: string;
  evaluation?: OutfitEvaluation;
}
export interface OutfitEvaluation {
  visual: 'cohesive' | 'ordinary' | 'review';
  context: 'suitable' | 'uncertain' | 'unsuitable';
  reasons: { aspect: 'color' | 'pattern' | 'texture' | 'shape' | 'overall'; observation: string }[];
  contextReason: string;
  limitations: string[];
}
export interface WearRecord {
  id: string;
  date: string;
  itemIds: string[];
  status: 'planned' | 'recorded';
  note: string;
}
export interface Profile {
  nickname: string;
  styles: string[];
  colors: string[];
  region: string;
}
export interface WardrobeState {
  version: 1;
  loggedIn: boolean;
  onboarded: boolean;
  profile: Profile;
  garments: Garment[];
  likes: string[];
  records: WearRecord[];
}
export interface PurchaseResult {
  similar: Garment[];
  partners: Garment[];
  outfits: { outfit: Outfit; replaceableBy?: string }[];
  possible: number;
  replaceable: number;
  additional: number;
  mock: true;
}
