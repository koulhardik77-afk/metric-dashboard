// ============================================================
// Database Query Helpers
// ============================================================

import { db } from './database';
import type { MetricRecord, Restaurant, UploadRecord, Granularity, MetricGroup } from '@/types';

// --- Restaurants ---
export async function getAllRestaurants(): Promise<Restaurant[]> {
  return db.restaurants.toArray();
}

export async function getRestaurantById(id: string): Promise<Restaurant | undefined> {
  return db.restaurants.get(id);
}

// --- Metric Records ---
export async function getMetricRecords(filters: {
  restaurantIds?: string[];
  metricKeys?: string[];
  metricGroup?: MetricGroup;
  dateStart?: string;
  dateEnd?: string;
  granularity?: Granularity;
}): Promise<MetricRecord[]> {
  let collection = db.metricRecords.toCollection();

  // Apply filters
  let records = await collection.toArray();

  if (filters.restaurantIds && filters.restaurantIds.length > 0) {
    records = records.filter((r) => filters.restaurantIds!.includes(r.restaurantId));
  }
  if (filters.metricKeys && filters.metricKeys.length > 0) {
    records = records.filter((r) => filters.metricKeys!.includes(r.metricKey));
  }
  if (filters.metricGroup && filters.metricGroup !== 'all' as string) {
    records = records.filter((r) => r.metricGroup === filters.metricGroup);
  }
  if (filters.dateStart) {
    records = records.filter((r) => r.date >= filters.dateStart!);
  }
  if (filters.dateEnd) {
    records = records.filter((r) => r.date <= filters.dateEnd!);
  }
  if (filters.granularity) {
    records = records.filter((r) => r.granularity === filters.granularity);
  }

  return records;
}

// --- Get date range of stored data ---
export async function getDateRange(): Promise<{ min: string; max: string } | null> {
  const records = await db.metricRecords.orderBy('date').toArray();
  if (records.length === 0) return null;

  return {
    min: records[0].date,
    max: records[records.length - 1].date,
  };
}

// --- Get available granularities ---
export async function getAvailableGranularities(): Promise<Granularity[]> {
  const records = await db.metricRecords.toArray();
  const grans = new Set<Granularity>();
  records.forEach((r) => grans.add(r.granularity));
  return Array.from(grans);
}

// --- Upload History ---
export async function getUploadHistory(): Promise<UploadRecord[]> {
  return db.uploads.orderBy('uploadedAt').reverse().toArray();
}

// --- Get total record count ---
export async function getTotalRecordCount(): Promise<number> {
  return db.metricRecords.count();
}

// --- Check if data exists ---
export async function hasData(): Promise<boolean> {
  const count = await db.metricRecords.count();
  return count > 0;
}

/**
 * Delete ALL metric records for a specific date (ISO format: YYYY-MM-DD).
 * Useful to remove a day that was uploaded by mistake.
 */
export async function deleteRecordsByDate(date: string): Promise<number> {
  const records = await db.metricRecords
    .where('date')
    .equals(date)
    .toArray();

  const ids = records.map((r) => r.id!).filter(Boolean);
  if (ids.length === 0) return 0;

  await db.metricRecords.bulkDelete(ids);
  return ids.length;
}
