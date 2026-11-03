import { JSDOM } from 'jsdom';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { initialState, sampleGarments } from '../lib/seed';
import { generateOutfits, mockPurchase } from '../lib/wardrobe-logic';
import { wardrobeRepository } from '../lib/repository';
import { failNextRequest, readPhoto } from '../lib/mock-api';
import type { Garment, WardrobeState } from '../lib/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000',
});
Object.assign(globalThis, {
  self: dom.window,
  Node: dom.window.Node,
  location: dom.window.location,
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  HTMLInputElement: dom.window.HTMLInputElement,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0),
  cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { render, screen, within, waitFor, cleanup, fireEvent } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AppRouterContext } =
  await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const { PathnameContext, SearchParamsContext } =
  await import('next/dist/shared/lib/hooks-client-context.shared-runtime.js');
const { StoreProvider } = await import('../components/store');
const { Application } = await import('../components/application');

const KEY = 'ai-wardrobe-prototype:v1';
function stored(): WardrobeState {
  return JSON.parse(localStorage.getItem(KEY)!);
}
function Harness({ start = '/' }: { start?: string }) {
  const [href, setHref] = useState(start);
  const url = new URL(href, 'http://localhost:3000');
  const router = {
    push: setHref,
    replace: setHref,
    back() {},
    forward() {},
    refresh() {},
    prefetch() {},
    bfcacheId: 'test',
  };
  // Exercise UI/state; framework navigation is stubbed, not a browser E2E claim.
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={url.pathname}>
        <SearchParamsContext.Provider value={url.searchParams}>
          <div
            onClickCapture={(e) => {
              const a = (e.target as Element).closest('a');
              if (a) {
                e.preventDefault();
                e.stopPropagation();
                setHref(a.getAttribute('href') || '/');
              }
            }}
          >
            <StoreProvider>
              <Application />
            </StoreProvider>
          </div>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('complete outfit slots, excluded items, and newly registered anchor are respected', () => {
  const items = sampleGarments();
  const added: Garment = { ...items[0], id: 'new-top', name: '새 상의' };
  const results = generateOutfits(
    [added, ...items.map((g) => ({ ...g, excluded: g.id === 'b001' }))],
    '일상',
    'new-top',
  );
  assert.ok(results.length > 0);
  assert.ok(results.every((o) => o.itemIds.includes('new-top') && !o.itemIds.includes('b001')));
  for (const o of results) assert.equal(o.itemIds.length, 3);
  assert.equal(
    generateOutfits(
      items.filter((g) => g.category !== '신발'),
      '일상',
    ).length,
    0,
  );
  assert.equal(generateOutfits(items, '일상', 'missing').length, 0);
});
test('onepiece and shoes can form an outfit without top or bottom', () => {
  const dress: Garment = { ...sampleGarments()[0], id: 'dress', category: '원피스' };
  const results = generateOutfits(
    [dress, ...sampleGarments().filter((g) => g.category === '신발')],
    '일상',
    'dress',
  );
  assert.equal(results.length, 4);
  assert.ok(results.every((o) => o.itemIds.length === 2 && o.itemIds.includes('dress')));
});
test('purchase fixture uses current wardrobe and separates replacement from additional combinations', () => {
  const items = sampleGarments();
  const product = { ...items[0], id: 'product' };
  const result = mockPurchase(items, product);
  assert.equal(result.mock, true);
  assert.equal(result.possible, result.replaceable + result.additional);
  assert.ok(result.outfits.every((o) => o.outfit.itemIds.includes('product')));
  assert.ok(result.replaceable > 0);
  assert.ok(result.partners.every((g) => items.some((i) => i.id === g.id)));
  assert.equal(mockPurchase([], product).possible, 0);
  const changed = mockPurchase(
    items.filter((g) => g.category !== '신발'),
    product,
  );
  assert.equal(changed.possible, 0);
});
test('repository persists shared state and reports malformed saved data', () => {
  const state = initialState();
  state.likes = ['outfit:t001:b001:s001'];
  wardrobeRepository.save(state);
  assert.deepEqual(wardrobeRepository.load(), state);
  localStorage.setItem(KEY, 'invalid');
  assert.throws(() => wardrobeRepository.load(), /읽지 못했어요/);
});
test('unsupported or oversized photos are rejected before image decoding', async () => {
  await assert.rejects(
    () =>
      readPhoto(new dom.window.File(['x'], 'bad.txt', { type: 'text/plain' }) as unknown as File),
    /JPG/,
  );
  const tooBig = { type: 'image/jpeg', size: 13 * 1024 * 1024 } as File;
  await assert.rejects(() => readPhoto(tooBig), /12MB/);
});
test('login → onboarding → registration → anchored outfit → planned record → user record → purchase → HOME', async () => {
  const user = userEvent.setup({ document });
  render(<Harness />);
  await user.click(await screen.findByRole('button', { name: /가입 없이 데모 체험/ }));
  await screen.findByRole('heading', { name: /어떤 스타일/ }, { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: '다음' }));
  await user.click(screen.getByRole('button', { name: '예시 옷 12벌로 먼저 체험' }));
  await screen.findByRole('heading', { name: /오늘도 나답게/ });
  await user.click(
    within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', {
      name: '옷장',
    }),
  );
  await user.click(screen.getByRole('link', { name: '옷 등록' }));
  await user.click(screen.getByRole('button', { name: '인디고 데님 셔츠 예시 사진 선택' }));
  await user.click(screen.getByRole('button', { name: '특징 후보 확인하기' }));
  await screen.findByRole('heading', { name: '이렇게 등록할까요?' }, { timeout: 3000 });
  await user.clear(screen.getByLabelText('옷 이름'));
  await user.type(screen.getByLabelText('옷 이름'), '새로 등록한 셔츠');
  await user.click(screen.getByRole('button', { name: '내 옷장에 저장' }));
  await screen.findByRole('heading', { name: '새로 등록한 셔츠' });
  const added = stored().garments.find((g) => g.name === '새로 등록한 셔츠')!;
  assert.ok(added);
  assert.equal(stored().garments.length, 13);
  await user.click(screen.getByRole('link', { name: '이 옷으로 코디 추천' }));
  await screen.findByRole('heading', { name: '오늘, 어떻게 입을까요?' });
  const detail = await screen.findAllByRole(
    'link',
    { name: '코디 자세히 보기' },
    { timeout: 3000 },
  );
  assert.ok(detail.every((a) => decodeURIComponent(a.getAttribute('href')!).includes(added.id)));
  await user.click(detail[0]);
  await user.click(screen.getByRole('button', { name: '좋아요' }));
  assert.equal(stored().likes.length, 1);
  await user.click(screen.getByRole('button', { name: '오늘 입을래요' }));
  await screen.findByRole('heading', { name: '기록 수정' });
  const planned = stored().records.find((r) => r.itemIds.includes(added.id))!;
  assert.equal(planned.status, 'planned');
  await user.selectOptions(screen.getByLabelText('기록 종류'), 'recorded');
  await user.click(screen.getByRole('button', { name: '기록 저장' }));
  assert.equal(stored().records.find((r) => r.id === planned.id)?.status, 'recorded');
  await user.click(
    within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', {
      name: '구매분석',
    }),
  );
  await user.click(screen.getByRole('button', { name: '인디고 데님 셔츠 예시 사진 선택' }));
  await user.click(screen.getByRole('button', { name: '내 옷장과 비교하기' }));
  await screen.findByRole('heading', { name: '새 옷이 더해주는 가능성' }, { timeout: 3000 });
  assert.ok(screen.getAllByText('전체 결과·숫자는 예시 데이터').length);
  await user.click(screen.getByRole('link', { name: 'HOME으로' }));
  await screen.findByRole('heading', { name: /오늘도 나답게/ });
  assert.ok(screen.getByText('13벌의 가능성'));
  cleanup();
  render(<Harness start="/wardrobe" />);
  await screen.findByRole('heading', { name: '나의 옷장' });
  assert.ok(screen.getByRole('heading', { name: '새로 등록한 셔츠' }));
});
test('recommendation error, retry, exclusion and restoration change shared results', async () => {
  const state = initialState();
  state.loggedIn = true;
  state.onboarded = true;
  wardrobeRepository.save(state);
  failNextRequest();
  const user = userEvent.setup({ document });
  render(<Harness start="/outfits?anchor=t001" />);
  await screen.findByRole('alert', {}, { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  const links = await screen.findAllByRole('link', { name: '코디 자세히 보기' }, { timeout: 3000 });
  assert.ok(links.length);
  await user.click(
    within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', {
      name: '옷장',
    }),
  );
  await user.click(screen.getByRole('heading', { name: '차콜 그래픽 티셔츠' }));
  await user.click(screen.getByRole('button', { name: '추천 제외' }));
  assert.equal(stored().garments.find((g) => g.id === 't001')?.excluded, true);
  await user.click(screen.getByRole('link', { name: '마이페이지' }));
  await user.click(screen.getByRole('button', { name: '해제' }));
  assert.equal(stored().garments.find((g) => g.id === 't001')?.excluded, false);
});
test('record editing and deletion are reflected in storage', async () => {
  const state = initialState();
  state.loggedIn = true;
  state.onboarded = true;
  wardrobeRepository.save(state);
  const user = userEvent.setup({ document });
  render(<Harness start="/records?edit=sample-record-1" />);
  const memo = await screen.findByLabelText('메모');
  await user.clear(memo);
  await user.type(memo, '수정한 메모');
  await user.click(screen.getByRole('button', { name: '기록 저장' }));
  assert.equal(stored().records.find((r) => r.id === 'sample-record-1')?.note, '수정한 메모');
  await user.click(screen.getByRole('button', { name: '기록 삭제' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제하기' }));
  assert.ok(!stored().records.some((r) => r.id === 'sample-record-1'));
});
test('garment editing and deletion clean linked records and liked outfits', async () => {
  const state = initialState();
  state.loggedIn = true;
  state.onboarded = true;
  state.likes = ['outfit:t002:b005:s002'];
  wardrobeRepository.save(state);
  const user = userEvent.setup({ document });
  render(<Harness start="/wardrobe/t002/edit" />);
  const name = await screen.findByLabelText('옷 이름');
  await user.clear(name);
  await user.type(name, '수정한 티셔츠');
  await user.click(screen.getByRole('button', { name: '수정한 정보 저장' }));
  await screen.findByRole('heading', { name: '수정한 티셔츠' });
  await user.click(screen.getByRole('button', { name: '삭제' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제하기' }));
  assert.ok(!stored().garments.some((g) => g.id === 't002'));
  assert.equal(stored().likes.length, 0);
  assert.ok(stored().records.every((r) => !r.itemIds.includes('t002')));
});
test('empty closet can skip onboarding and shows useful empty states', async () => {
  const state = initialState();
  state.loggedIn = true;
  wardrobeRepository.save(state);
  const user = userEvent.setup({ document });
  render(<Harness start="/onboarding" />);
  await user.click(await screen.findByRole('button', { name: '나중에 설정하기' }));
  await user.click(screen.getByRole('button', { name: '건너뛰고 빈 옷장 둘러보기' }));
  await screen.findByRole('heading', { name: '내 옷장에서 하루를 시작해요' });
  assert.equal(stored().garments.length, 0);
  await user.click(
    within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', {
      name: '옷장',
    }),
  );
  await screen.findByRole('heading', { name: '아직 비어 있는 옷장' });
});

test('purchased product becomes a real wardrobe item with an anchored recommendation entry', async () => {
  const state = initialState();
  state.loggedIn = true;
  state.onboarded = true;
  wardrobeRepository.save(state);
  const user = userEvent.setup({ document });
  render(<Harness start="/purchase" />);
  await user.click(
    await screen.findByRole('button', { name: '화이트 배색 스니커즈 예시 사진 선택' }),
  );
  await user.click(screen.getByRole('button', { name: '내 옷장과 비교하기' }));
  await screen.findByRole('heading', { name: '새 옷이 더해주는 가능성' }, { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: '구매했어요 · 옷장에 추가' }));
  await screen.findByRole('heading', { name: '화이트 배색 스니커즈 (구매 예정)' });
  const product = stored().garments.find((g) => g.id.startsWith('purchase-'))!;
  assert.equal(product.category, '신발');
  assert.equal(stored().garments.length, 13);
  assert.ok(
    screen
      .getByRole('link', { name: '이 옷으로 코디 추천' })
      .getAttribute('href')
      ?.includes(product.id),
  );
});

test('profile preferences and region persist', async () => {
  const state = initialState();
  state.loggedIn = true;
  state.onboarded = true;
  wardrobeRepository.save(state);
  const user = userEvent.setup({ document });
  render(<Harness start="/profile" />);
  const nickname = await screen.findByLabelText('닉네임');
  await user.clear(nickname);
  await user.type(nickname, '테스터');
  await user.selectOptions(screen.getByLabelText('날씨 지역'), '부산');
  await user.click(screen.getByRole('button', { name: '설정 저장' }));
  assert.equal(stored().profile.nickname, '테스터');
  assert.equal(stored().profile.region, '부산');
});
