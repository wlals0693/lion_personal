import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="state-box">
      <h1>페이지를 찾을 수 없어요</h1>
      <Link href="/" className="button primary">
        HOME으로
      </Link>
    </main>
  );
}
