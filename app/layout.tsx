import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StoreProvider } from '@/components/store';
import './globals.css';
export const metadata: Metadata = {
  title: '옷의 여유 — AI 디지털 옷장',
  description:
    '내 옷의 가능성을 발견하는 AI 디지털 옷장 체험. 등록부터 코디, 착용 기록과 구매 분석까지.',
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main-content">
          본문으로 건너뛰기
        </a>
        <StoreProvider>
          <Suspense fallback={<div className="boot-loading">옷장을 준비하고 있어요…</div>}>
            {children}
          </Suspense>
        </StoreProvider>
      </body>
    </html>
  );
}
