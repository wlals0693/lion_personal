import { demoPhoto } from '@/lib/demo-catalog';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return new Response(new Uint8Array(await demoPhoto(id)), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ error: '자료 사진을 읽지 못했어요.' }, { status: 404 });
  }
}
