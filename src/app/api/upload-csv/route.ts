// ============================================================
// API Route: Upload / Delete CSV in Vercel Blob Storage
// Protected by x-admin-secret header
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

// POST: Upload a new CSV (replaces existing)
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

    // Delete any previously uploaded CSVs to keep storage clean
    try {
      const existing = await list({ prefix: 'dashboard-data/' });
      for (const blob of existing.blobs) {
        await del(blob.url);
      }
    } catch {
      // Ignore errors when listing/deleting old blobs
    }

    // Upload the new CSV with a timestamped name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = await put(`dashboard-data/${timestamp}.csv`, file, {
      access: 'public',
      contentType: 'text/csv',
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Upload to Blob failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload CSV to shared storage' },
      { status: 500 }
    );
  }
}

// DELETE: Clear all shared CSV data from Blob
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const existing = await list({ prefix: 'dashboard-data/' });
    for (const blob of existing.blobs) {
      await del(blob.url);
    }
    return NextResponse.json({ success: true, deleted: existing.blobs.length });
  } catch (error) {
    console.error('Failed to clear blobs:', error);
    return NextResponse.json(
      { error: 'Failed to clear shared data' },
      { status: 500 }
    );
  }
}
