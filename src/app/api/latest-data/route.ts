// ============================================================
// API Route: List all shared CSVs stored in Vercel Blob
// GET /api/latest-data
// ============================================================
// Returns all blobs under dashboard-data/, sorted newest first.
// Used by the admin panel to display upload history.
// ============================================================

import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await list({ prefix: 'dashboard-data/' });

    const blobs = result.blobs
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((b) => ({
        url: b.url,
        uploadedAt: b.uploadedAt,
        size: b.size,
        pathname: b.pathname,
      }));

    return NextResponse.json({ blobs, count: blobs.length });
  } catch (error) {
    console.error('Failed to list blobs:', error);
    return NextResponse.json(
      { blobs: [], count: 0, error: 'Failed to fetch shared data info' },
      { status: 500 }
    );
  }
}
