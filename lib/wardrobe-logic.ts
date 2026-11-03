import type { Garment, Outfit, PurchaseResult } from './types';

// These are deterministic UI fixtures, NOT fashion compatibility or ML scores.
export function generateOutfits(items: Garment[], occasion: string, anchorId?: string): Outfit[] {
  const anchor = items.find((g) => g.id === anchorId);
  if (anchorId && (!anchor || anchor.excluded)) return [];
  const active = items.filter((g) => !g.excluded);
  const by = (category: Garment['category']) => active.filter((g) => g.category === category);
  const tops = by('상의'),
    bottoms = by('하의'),
    shoes = by('신발'),
    dresses = by('원피스');
  const result: Outfit[] = [];
  function add(parts: Garment[]) {
    if (anchor?.category === '아우터') parts = [...parts, anchor];
    if (anchorId && !parts.some((g) => g.id === anchorId)) return;
    const itemIds = parts.map((g) => g.id);
    result.push({
      id: 'outfit:' + itemIds.join(':'),
      itemIds,
      occasion,
      title:
        occasion === '출근·등교'
          ? '담백하게 시작하는 하루'
          : occasion === '약속·데이트'
            ? '기분 좋은 만남을 위해'
            : '편안하지만 나답게',
    });
  }
  // Keep the prototype bounded; anchor filtering happens before the display limit.
  const poolT = anchor?.category === '상의' ? [anchor] : tops;
  const poolB = anchor?.category === '하의' ? [anchor] : bottoms;
  const poolS = anchor?.category === '신발' ? [anchor] : shoes;
  for (const t of poolT)
    for (const b of poolB)
      for (const s of poolS) {
        add([t, b, s]);
        if (result.length >= 120) return result;
      }
  const poolD = anchor?.category === '원피스' ? [anchor] : dresses;
  for (const d of poolD)
    for (const s of poolS) {
      add([d, s]);
      if (result.length >= 120) return result;
    }
  return result;
}
export function mockPurchase(items: Garment[], product: Garment): PurchaseResult {
  const active = items.filter((g) => !g.excluded);
  const same = active.filter((g) => g.category === product.category);
  const similar = [...same]
    .sort((a, b) => Number(b.color === product.color) - Number(a.color === product.color))
    .slice(0, 3);
  const candidates = generateOutfits([...active, product], '구매 상품 활용', product.id).slice(
    0,
    6,
  );
  // Demonstration only: simple color/style equality is a fixture for replacement,
  // not a validated substitute criterion and not the full Utility universe.
  const substitute = same.find((g) => g.color === product.color && g.style === product.style);
  const outfits = candidates.map((outfit, i) => ({
    outfit,
    replaceableBy: substitute && i % 2 === 0 ? substitute.id : undefined,
  }));
  const replaceable = outfits.filter((o) => o.replaceableBy).length;
  return {
    mock: true,
    similar,
    partners: active.filter((g) => outfits.some((o) => o.outfit.itemIds.includes(g.id))),
    outfits,
    possible: outfits.length,
    replaceable,
    additional: outfits.length - replaceable,
  };
}
