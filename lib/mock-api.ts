import type { Category, Garment, Outfit, PurchaseResult } from './types';
import { generateOutfits, mockPurchase } from './wardrobe-logic';
let failNext = false;
export function failNextRequest() {
  failNext = true;
}
async function request<T>(value: () => T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (failNext) {
    failNext = false;
    throw new Error('잠시 연결이 어려워요. 입력한 내용은 그대로 있으니 다시 시도해주세요.');
  }
  return value();
}
export interface WardrobeApi {
  analyzeImage(
    image: string,
    category: Category,
  ): Promise<Pick<Garment, 'name' | 'category' | 'color' | 'style'>>;
  recommend(items: Garment[], occasion: string, anchor?: string): Promise<Outfit[]>;
  analyzePurchase(items: Garment[], product: Garment): Promise<PurchaseResult>;
  authenticate(email: string): Promise<void>;
}
export const wardrobeApi: WardrobeApi = {
  analyzeImage: (_image, category) =>
    request(() => ({
      name: `새로운 ${category}`,
      category,
      color: '잘 모르겠어요',
      style: '캐주얼',
    })),
  recommend: (items, occasion, anchor) => request(() => generateOutfits(items, occasion, anchor)),
  analyzePurchase: (items, product) => request(() => mockPurchase(items, product)),
  authenticate: (_email) => request(() => undefined),
};

export async function readPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('JPG, PNG, WebP 사진을 선택해주세요.');
  if (file.size > 12 * 1024 * 1024) throw new Error('12MB 이하 사진을 선택해주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('사진을 열 수 없어요. 다른 사진으로 다시 시도해주세요.'));
      im.src = url;
    });
    const ratio = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서 사진을 처리하지 못했어요.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
