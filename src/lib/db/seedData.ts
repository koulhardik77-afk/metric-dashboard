// ============================================================
// Seed Data Loader — Auto-imports bundled CSV data on first visit
// ============================================================
// This module checks if IndexedDB is empty and, if so, fetches
// the CSV files bundled in /public and imports them automatically.
// This ensures every visitor (including HR reviewers) sees a
// fully populated dashboard without needing to upload anything.
// ============================================================

import Papa from 'papaparse';
import type { MetricRecord, Restaurant, Granularity, CsvRow } from '@/types';
import { CSV_METRIC_MAP } from '@/lib/metrics/definitions';
import { parseCsvDate, toISODate } from '@/lib/utils/dates';
import { parseNumericValue } from '@/lib/utils/format';
import { db, upsertMetricRecords, upsertRestaurants, addUploadRecord } from './database';

// The CSV files placed in /public during build
const SEED_CSV_FILES: string[] = [
  // Add seed CSV paths here after uploading new data
];

/**
 * Check if the database is empty and, if so, load bundled seed data.
 * This is safe to call on every page load — it's a no-op if data exists.
 */
export async function ensureSeedData(): Promise<boolean> {
  const count = await db.metricRecords.count();
  if (count > 0) {
    // Data already exists — skip seeding
    return false;
  }

  console.log('[SeedData] No data found in IndexedDB. Loading bundled CSV data...');

  let totalRecords = 0;
  let totalRestaurants = 0;

  for (const csvPath of SEED_CSV_FILES) {
    try {
      const response = await fetch(csvPath);
      if (!response.ok) {
        console.warn(`[SeedData] Failed to fetch ${csvPath}: ${response.status}`);
        continue;
      }

      const csvText = await response.text();
      const { restaurants, records, dateRange, granularity } = parseCsvText(csvText);

      if (restaurants.length > 0) {
        await upsertRestaurants(restaurants);
        totalRestaurants += restaurants.length;
      }

      if (records.length > 0) {
        const count = await upsertMetricRecords(records);
        totalRecords += count;
      }

      // Log the upload
      await addUploadRecord({
        fileName: `[bundled] ${csvPath}`,
        uploadedAt: new Date().toISOString(),
        dateRangeStart: dateRange.start,
        dateRangeEnd: dateRange.end,
        restaurantCount: restaurants.length,
        recordCount: records.length,
        status: 'success',
        errors: [],
        warnings: ['Auto-imported from bundled seed data'],
      });

      console.log(`[SeedData] Imported ${csvPath}: ${restaurants.length} restaurants, ${records.length} records`);
    } catch (err) {
      console.error(`[SeedData] Error processing ${csvPath}:`, err);
    }
  }

  console.log(`[SeedData] Seeding complete: ${totalRestaurants} restaurants, ${totalRecords} records`);
  return totalRecords > 0;
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

    // Register restaurant
    if (!restaurants.has(restId)) {
      restaurants.set(restId, {
        id: restId,
        name: restName,
        subzone,
        city,
        displayName: `${restName} — ${subzone}, ${city}`,
      });
    }

    // Check if this metric is one we care about
    const lookupKey = `${overview}|||${metric}`;
    const metricDef = CSV_METRIC_MAP.get(lookupKey);
    if (!metricDef) continue;

    // Process each date column
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
