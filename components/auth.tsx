'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Leaf, Check, ArrowLeft, LoaderCircle } from 'lucide-react';
import { useWardrobe } from './store';
import { wardrobeApi } from '@/lib/mock-api';
import { sampleGarments } from '@/lib/seed';
import { colors, styles } from '@/lib/types';
import { toggleValue } from '@/lib/utils';
import { ErrorBox } from './ui';
export function Auth() {
  const { state, update } = useWardrobe();
  const router = useRouter();
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function login(demo = false) {
    setBusy(true);
    setError('');
    try {
      await wardrobeApi.authenticate(demo ? 'demo@wardrobe.local' : email);
      if (update((s) => ({ ...s, loggedIn: true })))
        router.push(state.onboarded ? '/' : '/onboarding');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout" id="main-content">
      <section className="auth-editorial">
        <div className="auth-brand">
          <Leaf size={26} />
          STYLAI
        </div>
        <div className="auth-copy">
          <p className="eyebrow">A LITTLE LESS, A LITTLE MORE YOU</p>
          <h1>
            새 옷보다 먼저,
            <br />내 옷의 새로운 조합.
          </h1>
          <p>
            매일의 고민은 가볍게.
            <br />내 옷을 더 잘 활용하는 디지털 옷장.
          </p>
        </div>
        <div className="auth-photos">
          <img src="/clothes/t003.jpg" alt="데님 셔츠" />
          <img src="/clothes/s002.jpg" alt="화이트 스니커즈" />
        </div>
        <span className="auth-footnote">YOUR EVERYDAY, THOUGHTFULLY DRESSED.</span>
      </section>
      <section className="auth-form">
        <span className="eyebrow">YOUR PERSONAL WARDROBE STYLIST</span>
        <div>
          <p className="eyebrow">WELCOME TO YOUR WARDROBE</p>
          <h2>{signup ? '나만의 옷장을 시작해요' : '다시 만나 반가워요'}</h2>
          <p className="subtle">오늘도, 있는 옷으로 나답게.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label className="field">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@example.com"
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="4자 이상 입력해주세요"
              minLength={4}
              required
              autoComplete={signup ? 'new-password' : 'current-password'}
            />
          </label>
          <p className="caption">
            체험용 로그인입니다. 실제 비밀번호를 사용하지 마세요.
            <br />
            계정을 생성하거나 비밀번호를 저장하지 않아요.
          </p>
          {error && <ErrorBox message={error} />}
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {signup ? '가입하고 시작하기' : '로그인'}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <div className="or-divider">
          <span />
          또는
          <span />
        </div>
        <button className="button secondary full" onClick={() => void login(true)} disabled={busy}>
          가입 없이 데모 체험
          <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          {signup ? '이미 계정이 있나요?' : '처음 오셨나요?'}{' '}
          <button
            onClick={() => {
              setSignup(!signup);
              setError('');
            }}
          >
            {signup ? '로그인' : '회원가입'}
          </button>
        </p>
      </section>
    </main>
  );
}
export function Onboarding() {
  const { state, update } = useWardrobe();
  const router = useRouter();
  const [step, setStep] = useState(1),
    [nickname, setNickname] = useState(state.profile.nickname),
    [selected, setSelected] = useState(state.profile.styles),
    [selectedColors, setColors] = useState(state.profile.colors);
  function next() {
    if (
      update((s) => ({
        ...s,
        profile: {
          ...s.profile,
          nickname: nickname.trim() || '나',
          styles: selected,
          colors: selectedColors,
        },
      }))
    )
      setStep(2);
  }
  function finish(mode: 'sample' | 'empty' | 'skip') {
    if (
      update((s) => ({
        ...s,
        onboarded: true,
        garments: mode === 'sample' ? sampleGarments() : [],
        records: mode === 'sample' ? s.records : [],
        likes: [],
      }))
    )
      router.push(mode === 'empty' ? '/wardrobe/new' : '/');
  }
  return (
    <main className="onboarding" id="main-content">
      <div className="onboarding-top">
        <span className="auth-brand">
          <Leaf size={23} />
          STYLAI
        </span>
        <span className="subtle">0{step} / 02</span>
      </div>
      <div className="step-track">
        <span className="filled" />
        <span className={step === 2 ? 'filled' : ''} />
      </div>
      {step === 1 ? (
        <>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>
            어떤 스타일의
            <br />
            당신인가요?
          </h1>
          <p className="subtle">지금 마음에 드는 것만 골라주세요. 나중에 바꿀 수 있어요.</p>
          <label className="field">
            닉네임
            <input
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="어떻게 불러드릴까요?"
            />
          </label>
          <fieldset>
            <legend>
              선호 스타일 <span className="caption">여러 개 선택 가능</span>
            </legend>
            <div className="chips">
              {styles.map((style) => (
                <button
                  key={style}
                  className={`chip ${selected.includes(style) ? 'selected' : ''}`}
                  onClick={() => setSelected(toggleValue(selected, style))}
                  aria-pressed={selected.includes(style)}
                >
                  {style}
                  {selected.includes(style) && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>자주 손이 가는 색</legend>
            <div className="chips">
              {colors
                .filter((c) => c !== '잘 모르겠어요')
                .map((color) => (
                  <button
                    key={color}
                    className={`chip ${selectedColors.includes(color) ? 'selected' : ''}`}
                    aria-pressed={selectedColors.includes(color)}
                    onClick={() => setColors(toggleValue(selectedColors, color))}
                  >
                    {color}
                  </button>
                ))}
            </div>
          </fieldset>
          <button className="button primary full" onClick={next}>
            다음
            <ArrowRight size={17} />
          </button>
          <button className="text-button" onClick={() => setStep(2)}>
            나중에 설정하기
          </button>
        </>
      ) : (
        <>
          <p className="eyebrow">YOUR FIRST WARDROBE</p>
          <h1>
            옷장에 첫 번째 옷을
            <br />
            걸어볼까요?
          </h1>
          <p className="subtle">상의·하의·신발이 있으면 코디 조합을 체험할 수 있어요.</p>
          <div className="onboarding-clothes">
            {['t003', 'b005', 's002'].map((id) => (
              <img key={id} src={`/clothes/${id}.jpg`} alt="예시 의류" />
            ))}
          </div>
          <button className="button primary full" onClick={() => finish('empty')}>
            내 옷 사진으로 시작
            <ArrowRight size={17} />
          </button>
          <button className="button secondary full" onClick={() => finish('sample')}>
            예시 옷 12벌로 먼저 체험
          </button>
          <button className="text-button" onClick={() => finish('skip')}>
            건너뛰고 빈 옷장 둘러보기
          </button>
          <button className="text-button" onClick={() => setStep(1)}>
            <ArrowLeft size={14} />
            이전
          </button>
        </>
      )}
    </main>
  );
}
