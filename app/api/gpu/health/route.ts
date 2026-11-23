export const runtime = 'nodejs';
export async function GET() {
  try {
    const response = await fetch(
      `${process.env.WARDROBE_GPU_URL || 'http://127.0.0.1:8092'}/health`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      },
    );
    const value = await response.json();
    if (!response.ok || value.status !== 'ok') throw new Error('Not ready');
    return Response.json(
      { ready: true, model: 'Qwen3-VL-4B Q4_K_M' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        ready: false,
        message: 'GPU 서버가 준비되지 않았어요. 데탑에서 npm run gpu를 실행해주세요.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
