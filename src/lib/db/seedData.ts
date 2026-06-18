// ============================================================
// Seed Data Loader — Fetches shared CSV from Vercel Blob
// ============================================================
// On first visit, this module checks if IndexedDB is empty.
// If so, it fetches the latest CSV uploaded by the dashboard
// owner from Vercel Blob Storage and imports it automatically.
// This ensures every visitor sees the same shared data.
// ============================================================

import Papa from 'papaparse';
import type { MetricRecord, Restaurant, Granularity, CsvRow } from '@/types';
import { CSV_METRIC_MAP } from '@/lib/metrics/definitions';
import { parseCsvDate, toISODate } from '@/lib/utils/dates';
import { parseNumericValue } from '@/lib/utils/format';
import { db, upsertMetricRecords, upsertRestaurants, addUploadRecord } from './database';

/**
 * Check if the database is empty and, if so, fetch shared data
 * from Vercel Blob Storage. Safe to call on every page load —
 * it's a no-op if data already exists.
 */
export async function ensureSeedData(): Promise<boolean> {
  const count = await db.metricRecords.count();
  if (count > 0) {
    // Data already exists — skip seeding
    return false;
  }

  console.log('[SeedData] No data found. Fetching shared data from cloud...');

  try {
    // Fetch all CSVs via our server-side proxy (avoids CORS + private blob auth)
    const csvResponse = await fetch('/api/csv-data');
    if (!csvResponse.ok) {
      console.warn('[SeedData] Could not download shared CSVs:', csvResponse.status);
      return false;
    }

    const { csvTexts, count: csvCount } = await csvResponse.json() as { csvTexts: string[]; count: number };

    if (!csvTexts || csvCount === 0) {
      console.log('[SeedData] No shared data available yet');
      return false;
    }

    console.log(`[SeedData] Found ${csvCount} CSV file(s). Importing...`);

    let totalRestaurants = new Map<string, import('@/types').Restaurant>();
    let totalImported = 0;
    let overallDateStart = '';
    let overallDateEnd = '';

    // Parse and upsert each CSV (oldest first — already sorted by the API)
    for (const csvText of csvTexts) {
      const { restaurants, records, dateRange } = parseCsvText(csvText);
      if (restaurants.length === 0 || records.length === 0) continue;

      restaurants.forEach((r) => totalRestaurants.set(r.id, r));

      await upsertRestaurants(restaurants);
      const imported = await upsertMetricRecords(records);
      totalImported += imported;

      if (!overallDateStart || dateRange.start < overallDateStart) overallDateStart = dateRange.start;
      if (!overallDateEnd || dateRange.end > overallDateEnd) overallDateEnd = dateRange.end;
    }

    if (totalImported === 0) {
      console.warn('[SeedData] Shared CSVs contained no valid data');
      return false;
    }

    await addUploadRecord({
      fileName: `[shared] ${csvCount} cloud file(s)`,
      uploadedAt: new Date().toISOString(),
      dateRangeStart: overallDateStart,
      dateRangeEnd: overallDateEnd,
      restaurantCount: totalRestaurants.size,
      recordCount: totalImported,
      status: 'success',
      errors: [],
      warnings: ['Auto-imported from shared cloud storage'],
    });

    console.log(`[SeedData] Done: ${totalRestaurants.size} restaurants, ${totalImported} records across ${csvCount} file(s)`);
    return true;
  } catch (err) {
    console.error('[SeedData] Error fetching shared data:', err);
    return false;
  }
}

/**
 * Parse raw CSV text using the same logic as csvParser.ts,
 * but operates on a string instead of a File object.
 */
function parseCsvText(csvText: string): {
  restaurants: Restaurant[];
  records: MetricRecord[];
  dateRange: { start: string; end: string };
  granularity: Granularity;
} {
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  const restaurants = new Map<string, Restaurant>();
  const records: MetricRecord[] = [];

  if (rows.length === 0) {
    return { restaurants: [], records: [], dateRange: { start: '', end: '' }, granularity: 'daily' };
  }

  // Detect date columns
  const firstRow = rows[0];
  const requiredColumns = ['Restaurant ID', 'Restaurant name', 'Subzone', 'City', 'Overview', 'Metric'];
  const allColumns = Object.keys(firstRow);
  const dateColumns: { column: string; isoDate: string; isMonthly: boolean }[] = [];

  for (const col of allColumns) {
    if (requiredColumns.includes(col)) continue;
    const parsed = parseCsvDate(col);
    if (parsed) {
      dateColumns.push({
        column: col,
        isoDate: toISODate(parsed.date),
        isMonthly: parsed.isMonthly,
      });
    }
  }

  if (dateColumns.length === 0) {
    return { restaurants: [], records: [], dateRange: { start: '', end: '' }, granularity: 'daily' };
  }

  const isMonthlyData = dateColumns[0].isMonthly;
  const granularity: Granularity = isMonthlyData ? 'monthly' : 'daily';
  dateColumns.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  // Track sales and orders for AOV calculation
  const salesByRestDate = new Map<string, number>();
  const ordersByRestDate = new Map<string, number>();

  for (const row of rows) {
    const restId = String(row['Restaurant ID'] || '').trim();
    const restName = String(row['Restaurant name'] || '').trim();
    const subzone = String(row['Subzone'] || '').trim();
    const city = String(row['City'] || '').trim();
    const overview = String(row['Overview'] || '').trim();
    const metric = String(row['Metric'] || '').trim();

    if (!restId || !restName) continue;

    if (!restaurants.has(restId)) {
      restaurants.set(restId, {
        id: restId,
        name: restName,
        subzone,
        city,
        displayName: `${restName} — ${subzone}, ${city}`,
      });
    }

    const lookupKey = `${overview}|||${metric}`;
    const metricDef = CSV_METRIC_MAP.get(lookupKey);
    if (!metricDef) continue;

    for (const dc of dateColumns) {
      const rawValue = row[dc.column];
      const value = parseNumericValue(rawValue);

      records.push({
        restaurantId: restId,
        date: dc.isoDate,
        granularity,
        metricGroup: metricDef.group,
        metricKey: metricDef.key,
        value,
      });

      if (metricDef.key === 'sales') {
        salesByRestDate.set(`${restId}|${dc.isoDate}`, value);
      } else if (metricDef.key === 'delivered_orders') {
        ordersByRestDate.set(`${restId}|${dc.isoDate}`, value);
      }
    }
  }

  // Compute Average Order Value
  for (const [key, sales] of salesByRestDate) {
    const orders = ordersByRestDate.get(key) || 0;
    const aov = orders > 0 ? sales / orders : 0;
    const [restId, date] = key.split('|');

    records.push({
      restaurantId: restId,
      date,
      granularity,
      metricGroup: 'sales_overview',
      metricKey: 'average_order_value',
      value: aov,
    });
  }

  const dateRange = {
    start: dateColumns[0].isoDate,
    end: dateColumns[dateColumns.length - 1].isoDate,
  };

  return {
    restaurants: Array.from(restaurants.values()),
    records,
    dateRange,
    granularity,
  };
}
