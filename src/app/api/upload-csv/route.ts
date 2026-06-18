// ============================================================
// API Route: Upload / Delete CSV in Vercel Blob Storage
// Protected by x-admin-secret header
// ============================================================
// Each upload APPENDS a new blob — old ones are kept so the
// dashboard can accumulate data over time. Deduplication of
// records is handled client-side by the upsert logic.
// ============================================================

import { put, del, list } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest): boolean {
  const secret = request.headers.get('x-admin-secret');
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    console.error('[upload-csv] ADMIN_SECRET env var is not set');
    return false;
  }
  return secret === expected;
}

// POST: Append a new CSV to blob storage (keeps all previous uploads)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload with a timestamped name — old files are intentionally kept
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = await put(`dashboard-data/${timestamp}.csv`, file, {
      access: 'private',
      contentType: 'text/csv',
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Upload to Blob failed:', message);
    return NextResponse.json(
      { error: 'Failed to upload CSV to shared storage', detail: message },
      { status: 500 }
    );
  }
}

// DELETE all: Clear every CSV from blob storage
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional: delete a single blob by passing ?url=<blobUrl>
  const { searchParams } = new URL(request.url);
  const singleUrl = searchParams.get('url');

  try {
    if (singleUrl) {
      await del(singleUrl);
      return NextResponse.json({ success: true, deleted: 1 });
    }

    // No URL param → delete all
    const existing = await list({ prefix: 'dashboard-data/' });
    for (const blob of existing.blobs) {
      await del(blob.url);
    }
    return NextResponse.json({ success: true, deleted: existing.blobs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to delete blob(s):', message);
    return NextResponse.json(
      { error: 'Failed to delete', detail: message },
      { status: 500 }
    );
  }
}
