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
 * Dates that should never appear in the dashboard.
 * Any metric records stored for these ISO dates will be deleted
 * automatically on every page load (purgeBlacklistedDates).
 */
const BLACKLISTED_DATES: string[] = [
  '2026-06-21', // Sunday — data for this day should not be shown
];

/**
 * Delete all IndexedDB metric records whose date is in BLACKLISTED_DATES.
 * Safe to call on every page load — no-op if records are already absent.
 */
export async function purgeBlacklistedDates(): Promise<void> {
  for (const date of BLACKLISTED_DATES) {
    const records = await db.metricRecords.where('date').equals(date).toArray();
    if (records.length > 0) {
      const ids = records.map((r) => r.id!).filter(Boolean);
      await db.metricRecords.bulkDelete(ids);
      console.log(`[SeedData] Purged ${ids.length} records for blacklisted date: ${date}`);
    }
  }
}

/**
 * Check if the database is empty and, if so, fetch shared data
 * from Vercel Blob Storage. Safe to call on every page load —
 * it's a no-op if data already exists.
 */
export async function ensureSeedData(): Promise<boolean> {
  // Always purge blacklisted dates regardless of whether we seed
  await purgeBlacklistedDates();

  const count = await db.metricRecords.count();
  if (count > 0) {
    // Data already exists — skip seeding
    return false;
  }

  console.log('[SeedData] No data found. Fetching shared data from cloud...');

  try {
    // Step 1: Ask the API for the latest shared CSV URL
    const metaResponse = await fetch('/api/latest-data');
    if (!metaResponse.ok) {
      console.warn('[SeedData] Could not reach shared data API');
      return false;
    }

    const meta = await metaResponse.json();
    if (!meta.url) {
      console.log('[SeedData] No shared data available yet');
      return false;
    }

    // Step 2: Fetch the actual CSV from Vercel Blob
    const csvResponse = await fetch(meta.url);
    if (!csvResponse.ok) {
      console.warn('[SeedData] Could not download shared CSV');
      return false;
    }

    const csvText = await csvResponse.text();
    const { restaurants, records, dateRange, granularity } = parseCsvText(csvText);

    if (restaurants.length === 0 || records.length === 0) {
      console.warn('[SeedData] Shared CSV contained no valid data');
      return false;
    }

    // Step 3: Import into local IndexedDB
    await upsertRestaurants(restaurants);
    const importedCount = await upsertMetricRecords(records);

    await addUploadRecord({
      fileName: '[shared] cloud data',
      uploadedAt: new Date().toISOString(),
      dateRangeStart: dateRange.start,
      dateRangeEnd: dateRange.end,
      restaurantCount: restaurants.length,
      recordCount: importedCount,
      status: 'success',
      errors: [],
      warnings: ['Auto-imported from shared cloud storage'],
    });

    console.log(`[SeedData] Imported shared data: ${restaurants.length} restaurants, ${importedCount} records`);
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
