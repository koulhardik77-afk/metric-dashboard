// ============================================================
// API Route: Verify Admin Secret
// POST /api/admin/verify
// Body: { secret: string }
// Returns 200 if correct, 401 if wrong, 500 if not configured
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    console.error('[admin/verify] ADMIN_SECRET env var is not set');
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { secret } = body as { secret?: string };

    if (!secret || secret !== expected) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
