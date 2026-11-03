'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWardrobe } from './store';
import { Auth, Onboarding } from './auth';
import { Shell } from './shell';
import { Home } from './home';
import { Wardrobe, GarmentEditor, GarmentDetail } from './wardrobe';
import { Outfits, OutfitDetail } from './outfits';
import { Purchase } from './purchase';
import { Records } from './records';
import { Insights } from './insights';
import { Profile } from './profile';
import { Empty, ErrorBox, Loading } from './ui';
export function Application() {
  const { state, ready, error, reset } = useWardrobe();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!ready || error) return;
    if (!state.loggedIn && path !== '/login') router.replace('/login');
    else if (state.loggedIn && !state.onboarded && path !== '/onboarding')
      router.replace('/onboarding');
    else if (state.loggedIn && state.onboarded && (path === '/login' || path === '/onboarding'))
      router.replace('/');
  }, [ready, error, state.loggedIn, state.onboarded, path, router]);
  if (!ready) return <Loading />;
  if (error)
    return (
      <main className="onboarding">
        <ErrorBox message={error} />
        <button className="button primary" onClick={reset}>
          체험 데이터 초기화
        </button>
      </main>
    );
  if (!state.loggedIn) return path === '/login' ? <Auth /> : <Loading />;
  if (!state.onboarded) return path === '/onboarding' ? <Onboarding /> : <Loading />;
  const segments = path.split('/').filter(Boolean);
  let screen;
  if (path === '/') screen = <Home />;
  else if (path === '/wardrobe') screen = <Wardrobe />;
  else if (path === '/wardrobe/new') screen = <GarmentEditor />;
  else if (segments[0] === 'wardrobe' && segments.length === 3 && segments[2] === 'edit')
    screen = <GarmentEditor key={segments[1]} id={segments[1]} />;
  else if (segments[0] === 'wardrobe' && segments.length === 2)
    screen = <GarmentDetail key={segments[1]} id={segments[1]} />;
  else if (path === '/outfits') screen = <Outfits />;
  else if (path === '/outfits/detail') screen = <OutfitDetail />;
  else if (path === '/purchase') screen = <Purchase />;
  else if (path === '/records') screen = <Records />;
  else if (path === '/insights') screen = <Insights />;
  else if (path === '/profile') screen = <Profile />;
  else
    screen = (
      <Empty
        title="페이지를 찾을 수 없어요"
        description="주소를 확인하거나 HOME으로 돌아가주세요."
        href="/"
        label="HOME으로"
      />
    );
  return <Shell>{screen}</Shell>;
}
