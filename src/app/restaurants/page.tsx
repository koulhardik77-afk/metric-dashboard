'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession } from '@/hooks/useAdminSession';
import DashboardShell from '@/components/layout/DashboardShell';
import Header from '@/components/layout/Header';
import { Search, MapPin, TrendingUp, ChevronRight, Upload } from 'lucide-react';
import { getAllRestaurants, getMetricRecords, hasData } from '@/lib/db/queries';
import { computeSummary } from '@/lib/metrics/aggregation';
import { formatMetricValue } from '@/lib/utils/format';
import type { MetricRecord, Restaurant } from '@/types';
import Link from 'next/link';

export default function RestaurantsPage() {
  const router = useRouter();
  const adminSecret = useAdminSession();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [records, setRecords] = useState<MetricRecord[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'sales' | 'orders'>('sales');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [rests, recs] = await Promise.all([
        getAllRestaurants(),
        getMetricRecords({}),
      ]);
      setRestaurants(rests);
      setRecords(recs);
      setLoaded(true);
    }
    load();
  }, []);

  const restaurantData = useMemo(() => {
    return restaurants.map((rest) => {
      const restRecords = records.filter((r) => r.restaurantId === rest.id);
      const sales = computeSummary(restRecords, 'sales');
      const orders = computeSummary(restRecords, 'delivered_orders');
      const aov = orders > 0 ? sales / orders : 0;
      const impressions = computeSummary(restRecords, 'impressions');
      return { restaurant: rest, sales, orders, aov, impressions };
    });
  }, [restaurants, records]);

  const filteredData = useMemo(() => {
    let data = restaurantData;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (d) =>
          d.restaurant.name.toLowerCase().includes(q) ||
          d.restaurant.city.toLowerCase().includes(q) ||
          d.restaurant.subzone.toLowerCase().includes(q)
      );
    }
    // Sort
    data = [...data].sort((a, b) => {
      if (sortBy === 'name') return a.restaurant.name.localeCompare(b.restaurant.name);
      if (sortBy === 'sales') return b.sales - a.sales;
      return b.orders - a.orders;
    });
    return data;
  }, [restaurantData, search, sortBy]);

  if (!loaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <Header
        title="Restaurants"
        subtitle={`${restaurants.length} restaurants tracked`}
        onMenuClick={() => {}}
      />

      {/* Search & Sort */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search restaurants, cities..."
            className="form-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 160 }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'sales' | 'orders')}
        >
          <option value="sales">Sort by Sales</option>
          <option value="orders">Sort by Orders</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Restaurant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredData.map((data, i) => (
          <div
            key={data.restaurant.id}
            className="glass-card p-5 cursor-pointer group animate-fade-in"
            style={{ opacity: 0, animationDelay: `${i * 0.03}s` }}
            onClick={() => router.push(`/restaurant/${data.restaurant.id}`)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-primary)' }}
                >
                  {data.restaurant.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold group-hover:text-cyan-400 transition-colors" style={{ color: 'var(--text-primary)' }}>
                    {data.restaurant.name}
                  </p>
                  <div className="flex items-center gap-1">
                    <MapPin size={10} style={{ color: 'var(--text-muted)' }} />
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {data.restaurant.subzone}, {data.restaurant.city}
                    </p>
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Sales</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatMetricValue(data.sales, 'currency')}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Orders</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatMetricValue(data.orders, 'number')}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>AOV</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatMetricValue(data.aov, 'currency')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="text-center py-16">
          <p style={{ color: 'var(--text-muted)' }}>
            {restaurants.length === 0 ? (
              <>
                  No data available yet.{' '}
                  <button
                    onClick={() => router.push('/admin')}
                    className="underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {adminSecret ? 'Go to Admin Panel' : 'Admin Login'}
                  </button>
                </>
            ) : (
              'No restaurants match your search.'
            )}
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
