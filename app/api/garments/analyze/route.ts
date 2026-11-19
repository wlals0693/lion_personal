import { isPhotoAnalysis } from '@/lib/garment-analysis';

export const runtime = 'nodejs';
export const maxDuration = 100;
const MAX_BYTES = 12 * 1024 * 1024;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const expectedOrigin = new URL(request.url);
  // Next can use an internal localhost URL while the browser uses 127.0.0.1.
  expectedOrigin.host = request.headers.get('host') || expectedOrigin.host;
  if (origin && origin !== expectedOrigin.origin)
    return Response.json({ error: '허용되지 않은 요청이에요.' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > MAX_BYTES + 64 * 1024)
    return Response.json({ error: '12MB 이하 사진을 선택해주세요.' }, { status: 413 });
  let photo: FormDataEntryValue | null;
  try {
    photo = (await request.formData()).get('photo');
  } catch {
    return Response.json({ error: '사진 파일을 보내주세요.' }, { status: 400 });
  }
  if (!(photo instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))
    return Response.json({ error: 'JPG, PNG, WebP 사진을 선택해주세요.' }, { status: 400 });
  if (!photo.size || photo.size > MAX_BYTES)
    return Response.json(
      { error: '0바이트보다 크고 12MB 이하인 사진을 선택해주세요.' },
      { status: 413 },
    );
  try {
    const backend = await fetch(
      `${process.env.WARDROBE_GPU_URL || 'http://127.0.0.1:8092'}/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': photo.type },
        body: await photo.arrayBuffer(),
        signal: AbortSignal.timeout(90_000),
        cache: 'no-store',
      },
    );
    const result = await backend.json();
    if (!backend.ok)
      return Response.json(
        { error: result.error || '분석을 완료하지 못했어요.' },
        { status: backend.status },
      );
    if (!isPhotoAnalysis(result)) throw new Error('Invalid prediction');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      {
        error:
          '로컬 사진 분석에 연결하지 못했어요. GPU 분석 서버가 켜져 있는지 확인하고 다시 시도해주세요.',
      },
      { status: 503 },
    );
  }
}
