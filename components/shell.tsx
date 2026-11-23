'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Shirt, Layers, ScanLine, UserRound, ArrowUpRight, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
const nav = [
  { href: '/', label: 'HOME', icon: House },
  { href: '/wardrobe', label: '옷장', icon: Shirt },
  { href: '/outfits', label: '코디', icon: Layers },
  { href: '/purchase', label: '구매분석', icon: ScanLine },
];
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Sparkles size={22} />
          </span>
          <span>
            <span className="brand-wordmark">
              STYL<span>AI</span>
            </span>
            <span className="brand-sub">스타일아이 · YOUR WARDROBE STYLIST</span>
          </span>
        </Link>
        <p className="sidebar-caption">내 옷을 위한, 새로운 시선.</p>
        <nav aria-label="주요 메뉴">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`side-link ${(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}`}
            >
              <Icon size={19} strokeWidth={1.6} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/insights">
            내 옷장 돌아보기
            <ArrowUpRight size={16} />
          </Link>
          <Link href="/records">
            착용 기록
            <ArrowUpRight size={16} />
          </Link>
          <div className="sidebar-note">
            <span className="status-dot" />내 옷에서 시작하는 스타일
            <p>날씨·구매분석은 현재 체험용 예시입니다.</p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="mobile-brand">
            <Sparkles size={19} />
            STYLAI
          </Link>
          <span className="topbar-caption">A FRESH LOOK AT WHAT YOU OWN</span>
          <div className="topbar-right">
            <Link href="/profile" className="profile-link" aria-label="마이페이지">
              <UserRound size={19} />
            </Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="page-footer">옷을 더 사기 전에, 내 옷의 가능성부터.</footer>
      </div>
      <nav className="bottom-nav" aria-label="모바일 주요 메뉴">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              (href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined
            }
          >
            <Icon size={20} strokeWidth={1.6} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
