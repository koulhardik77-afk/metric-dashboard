// ============================================================
// API Route: Delete a specific date's data from all Vercel Blob CSVs
// DELETE /api/delete-date?date=2026-06-21
// Protected by x-admin-secret header
// ============================================================
// This route:
//  1. Lists all CSVs in Vercel Blob under dashboard-data/
//  2. For each CSV, removes the column whose parsed ISO date matches
//     the target date (e.g. "21 Jun, 2026" → 2026-06-21)
//  3. Re-uploads the stripped CSV (overwriting the original)
// ============================================================

import { list, put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { parseCsvDate, toISODate } from '@/lib/utils/dates';

function isAuthorized(request: NextRequest): boolean {
  const secret = request.headers.get('x-admin-secret');
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  return secret === expected;
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get('date'); // e.g. "2026-06-21"

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json(
      { error: 'Provide ?date=YYYY-MM-DD query param' },
      { status: 400 }
    );
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const { blobs } = await list({ prefix: 'dashboard-data/', token });

    if (blobs.length === 0) {
      return NextResponse.json({ success: true, modified: 0, message: 'No blobs found' });
    }

    let modified = 0;
    const details: string[] = [];

    for (const blob of blobs) {
      const res = await fetch(blob.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        details.push(`SKIP ${blob.pathname}: fetch failed (${res.status})`);
        continue;
      }
      const csvText = await res.text();

      const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.data.length === 0) {
        details.push(`SKIP ${blob.pathname}: empty CSV`);
        continue;
      }

      const allColumns = parsed.meta.fields ?? Object.keys(parsed.data[0]);

      // Find columns matching targetDate using the same parseCsvDate logic
      const columnsToRemove = allColumns.filter((col) => {
        const parsed = parseCsvDate(col);
        if (!parsed) return false;
        return toISODate(parsed.date) === targetDate;
      });

      if (columnsToRemove.length === 0) {
        details.push(`SKIP ${blob.pathname}: date ${targetDate} not found`);
        continue;
      }

      // Strip those columns
      const keptColumns = allColumns.filter((col) => !columnsToRemove.includes(col));
      const strippedRows = parsed.data.map((row) => {
        const newRow: Record<string, string> = {};
        for (const col of keptColumns) newRow[col] = row[col] ?? '';
        return newRow;
      });

      const newCsv = Papa.unparse(strippedRows, { columns: keptColumns });

      await put(blob.pathname, newCsv, {
        access: 'public',
        contentType: 'text/csv',
        token,
        allowOverwrite: true,
      });

      modified++;
      details.push(`MODIFIED ${blob.pathname}: removed [${columnsToRemove.join(', ')}]`);
    }

    return NextResponse.json({
      success: true,
      targetDate,
      blobsScanned: blobs.length,
      modified,
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[delete-date] Error:', message);
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 });
  }
}
