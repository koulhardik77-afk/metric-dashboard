// ============================================================
// API Route: Return ALL stored CSVs to the browser (server proxy)
// GET /api/csv-data
// ============================================================
// Fetches every CSV from Vercel Blob on the server (bypassing
// browser CORS restrictions) and returns their combined text as
// a JSON array. The client parses and upserts each one; the
// upsert logic deduplicates by restaurantId+date+metricKey.
// ============================================================

import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await list({ prefix: 'dashboard-data/' });

    if (result.blobs.length === 0) {
      return NextResponse.json({ csvTexts: [], count: 0 }, { status: 200 });
    }

    // Sort oldest → newest so upserts apply in chronological order
    const sorted = result.blobs.sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );

    // Fetch all blobs server-side (avoids CORS + private blob auth)
    const csvTexts: string[] = [];
    for (const blob of sorted) {
      const res = await fetch(blob.url, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        },
      });
      if (res.ok) {
        csvTexts.push(await res.text());
      } else {
        console.warn(`[csv-data] Failed to fetch blob ${blob.url}: ${res.status}`);
      }
    }

    return NextResponse.json(
      { csvTexts, count: csvTexts.length },
      {
        status: 200,
        headers: {
          // Cache for 2 minutes — reduces repeated blob fetches on Vercel edge
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[csv-data] Failed to proxy CSVs:', message);
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 });
  }
}
