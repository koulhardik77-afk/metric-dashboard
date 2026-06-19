// ============================================================
// API Route: Get Latest Shared CSV from Vercel Blob
// ============================================================
// Returns the URL of the most recently uploaded CSV so any
// visitor can fetch and import the shared data.
// ============================================================

import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const result = await list({ prefix: 'dashboard-data/', token });

    if (result.blobs.length === 0) {
      return NextResponse.json({ url: null, message: 'No shared data available' });
    }

    // Get the most recent blob (sorted by upload date)
    const latest = result.blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    return NextResponse.json({
      url: latest.url,
      uploadedAt: latest.uploadedAt,
      size: latest.size,
    });
  } catch (error) {
    console.error('Failed to list blobs:', error);
    return NextResponse.json(
      { url: null, error: 'Failed to fetch shared data info' },
      { status: 500 }
    );
  }
}
