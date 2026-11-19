import { demoCatalog } from '@/lib/demo-catalog';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return Response.json(await demoCatalog(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      {
        error:
          '전달받은 의류 자료를 읽지 못했어요. wardrobe-desktop-handoff 폴더 또는 WARDROBE_MODEL_ROOT 경로를 확인해주세요.',
      },
      { status: 503 },
    );
  }
}
