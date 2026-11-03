export const categories = ['상의', '하의', '신발', '아우터', '원피스'] as const;
export type Category = (typeof categories)[number];
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
  '잘 모르겠어요',
];
export interface Garment {
  id: string;
  name: string;
  category: Category;
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
