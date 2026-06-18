'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession } from '@/hooks/useAdminSession';
import DashboardShell from '@/components/layout/DashboardShell';
import Header from '@/components/layout/Header';
import KpiCard from '@/components/cards/KpiCard';
import TrendLineChart from '@/components/charts/TrendLineChart';
import ComparisonBarChart from '@/components/charts/ComparisonBarChart';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Eye,
  Upload,
  Store,
  Calendar,
  BarChart3,
  Filter,
} from 'lucide-react';
import { db } from '@/lib/db/database';
import { getAllRestaurants, getMetricRecords, hasData } from '@/lib/db/queries';
import { ensureSeedData } from '@/lib/db/seedData';
import { METRIC_DEFINITIONS, METRIC_GROUPS, PRIMARY_KPIS, getMetricDefinition, getMetricsByGroup } from '@/lib/metrics/definitions';
import { aggregateRecords, computeSummary, groupByDate, groupByRestaurant } from '@/lib/metrics/aggregation';
import { formatMetricValue } from '@/lib/utils/format';
import type { MetricRecord, Restaurant, Granularity, MetricGroup } from '@/types';
import Link from 'next/link';

const KPI_ICONS: Record<string, React.ReactNode> = {
  sales: <DollarSign size={16} style={{ color: 'var(--accent-primary)' }} />,
  delivered_orders: <ShoppingCart size={16} style={{ color: 'var(--accent-primary)' }} />,
  average_order_value: <TrendingUp size={16} style={{ color: 'var(--accent-primary)' }} />,
  impressions: <Eye size={16} style={{ color: 'var(--accent-primary)' }} />,
};

export default function OverviewPage() {
  const router = useRouter();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [hasDataState, setHasDataState] = useState(false);
  const [allRecords, setAllRecords] = useState<MetricRecord[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [activeGroup, setActiveGroup] = useState<MetricGroup | 'all'>('all');
  const [selectedMetric, setSelectedMetric] = useState<string>('sales');
  const [selectedRestaurants, setSelectedRestaurants] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const adminSecret = useAdminSession();

  const handleUploadClick = () => {
    router.push(adminSecret ? '/admin' : '/admin');
    // Always go to /admin — if logged in, they see the panel; if not, the login gate
  };

  // Load data
  const loadData = useCallback(async () => {
    // Auto-seed bundled CSV data on first visit (no-op if data already exists)
    await ensureSeedData();

    const dataExists = await hasData();
    setHasDataState(dataExists);

    if (dataExists) {
      const [rests, records] = await Promise.all([
        getAllRestaurants(),
        getMetricRecords({}),
      ]);
      setRestaurants(rests);
      setAllRecords(records);

      // Set initial date range
      if (records.length > 0) {
        const dates = records.map((r) => r.date).sort();
        setDateStart(dates[0]);
        setDateEnd(dates[dates.length - 1]);
      }

      // Check available granularities
      const grans = new Set(records.map((r) => r.granularity));
      if (!grans.has('daily') && grans.has('monthly')) {
        setGranularity('monthly');
      }
    }
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    let records = allRecords;
    if (dateStart) records = records.filter((r) => r.date >= dateStart);
    if (dateEnd) records = records.filter((r) => r.date <= dateEnd);
    if (selectedRestaurants.length > 0) {
      records = records.filter((r) => selectedRestaurants.includes(r.restaurantId));
    }
    return records;
  }, [allRecords, dateStart, dateEnd, selectedRestaurants]);

  // Aggregated records based on granularity
  const aggregatedRecords = useMemo(() => {
    if (granularity === 'daily') {
      return filteredRecords.filter((r) => r.granularity === 'daily');
    }
    return aggregateRecords(filteredRecords, granularity);
  }, [filteredRecords, granularity]);

  // Use whichever has data
  const displayRecords = aggregatedRecords.length > 0 ? aggregatedRecords : filteredRecords;

  // KPI values
  const kpiValues = useMemo(() => {
    return PRIMARY_KPIS.map((key) => {
      const def = getMetricDefinition(key);
      const value = computeSummary(displayRecords, key);
      return {
        key,
        label: def?.label || key,
        value,
        format: def?.format || 'number',
      };
    });
  }, [displayRecords]);

  // Trend chart data
  const trendData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    const metricRecords = displayRecords.filter((r) => r.metricKey === selectedMetric);

    for (const record of metricRecords) {
      if (!dateMap.has(record.date)) {
        dateMap.set(record.date, {});
      }
      const existing = dateMap.get(record.date)!;
      existing[record.restaurantId] = (existing[record.restaurantId] || 0) + record.value;
    }

    // Aggregate all restaurants into "Total"
    const totalData: { date: string; value: number }[] = [];
    for (const [date, values] of dateMap) {
      const metricDef = getMetricDefinition(selectedMetric);
      let total: number;
      if (metricDef?.aggregation === 'sum') {
        total = Object.values(values).reduce((s, v) => s + v, 0);
      } else {
        const nonZero = Object.values(values).filter((v) => v !== 0);
        total = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
      }
      totalData.push({ date, value: total });
    }

    return totalData.sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date: d.date,
      Total: d.value,
    }));
  }, [displayRecords, selectedMetric]);

  // Restaurant ranking data
  const restaurantRanking = useMemo(() => {
    const ranking = groupByRestaurant(displayRecords, selectedMetric);
    const restMap = new Map(restaurants.map((r) => [r.id, r]));
    const items = ranking.slice(0, 10).map((r) => {
      const rest = restMap.get(r.restaurantId);
      return {
        name: rest?.name || r.restaurantId,
        subzone: rest?.subzone || '',
        value: r.value,
      };
    });
    // Deduplicate names by appending subzone when a name appears more than once
    const nameCounts = new Map<string, number>();
    items.forEach((item) => nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1));
    return items.map((item) => ({
      name: nameCounts.get(item.name)! > 1 ? `${item.name} (${item.subzone})` : item.name,
      value: item.value,
    }));
  }, [displayRecords, selectedMetric, restaurants]);

  // All-restaurant table data
  const tableData = useMemo(() => {
    const restMap = new Map(restaurants.map((r) => [r.id, r]));
    const result: { restaurant: Restaurant; metrics: Record<string, number> }[] = [];

    for (const rest of restaurants) {
      const restRecords = displayRecords.filter((r) => r.restaurantId === rest.id);
      const metrics: Record<string, number> = {};
      for (const def of METRIC_DEFINITIONS) {
        metrics[def.key] = computeSummary(restRecords, def.key);
      }
      result.push({ restaurant: rest, metrics });
    }

    // Sort by sales descending
    result.sort((a, b) => (b.metrics.sales || 0) - (a.metrics.sales || 0));
    return result;
  }, [displayRecords, restaurants]);

  // Active group metrics for table
  const displayMetrics = useMemo(() => {
    if (activeGroup === 'all') {
      return METRIC_DEFINITIONS.filter((d) => PRIMARY_KPIS.includes(d.key));
    }
    return getMetricsByGroup(activeGroup as MetricGroup);
  }, [activeGroup]);

  const selectedMetricDef = getMetricDefinition(selectedMetric);

  // Empty state — shown to visitors when no data has loaded yet
  if (dataLoaded && !hasDataState) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center min-h-[80vh] animate-fade-in" style={{ opacity: 0 }}>
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
            style={{ background: 'rgba(6, 182, 212, 0.1)' }}
          >
            <Upload size={36} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to ZomatoPulse
          </h2>
          <p className="text-center max-w-md mb-8" style={{ color: 'var(--text-muted)' }}>
            No data has been loaded yet. If you are the admin, upload a CSV to make data available for all visitors.
          </p>
          <button onClick={handleUploadClick} className="btn-primary text-base px-8 py-3">
            <Upload size={18} />
            {adminSecret ? 'Go to Admin Panel' : 'Admin Login'}
          </button>
        </div>
      </DashboardShell>
    );
  }

  // Loading state
  if (!dataLoaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading dashboard...</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <Header
        title="Dashboard Overview"
        subtitle={`${restaurants.length} restaurants • ${dateStart && dateEnd ? `${new Date(dateStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(dateEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`}
        onMenuClick={() => {}}
        actions={
          <button onClick={handleUploadClick} className="btn-secondary text-sm">
            <Upload size={14} />
            {adminSecret ? 'Admin Panel' : 'Upload Data'}
          </button>
        }
      />

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6 animate-fade-in" style={{ opacity: 0 }}>
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="form-input"
            style={{ width: 150 }}
          />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="form-input"
            style={{ width: 150 }}
          />
        </div>

        {/* Granularity Toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          {(['daily', 'weekly', 'monthly'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className="px-4 py-2 text-xs font-semibold capitalize transition-all"
              style={{
                background: granularity === g ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                color: granularity === g ? 'white' : 'var(--text-secondary)',
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Restaurant Filter */}
        <div className="flex items-center gap-2">
          <Store size={14} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form-select"
            style={{ width: 200 }}
            value={selectedRestaurants.length === 0 ? 'all' : selectedRestaurants[0]}
            onChange={(e) => {
              if (e.target.value === 'all') {
                setSelectedRestaurants([]);
              } else {
                setSelectedRestaurants([e.target.value]);
              }
            }}
          >
            <option value="all">All Restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.subzone}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiValues.map((kpi, i) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            format={kpi.format}
            icon={KPI_ICONS[kpi.key]}
            delay={i}
          />
        ))}
      </div>

      {/* Metric Group Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setActiveGroup('all')}
          className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeGroup === 'all' ? 'tab-active' : ''}`}
          style={{ color: activeGroup === 'all' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          All Metrics
        </button>
        {METRIC_GROUPS.map((group) => (
          <button
            key={group.key}
            onClick={() => setActiveGroup(group.key)}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeGroup === group.key ? 'tab-active' : ''}`}
            style={{ color: activeGroup === group.key ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          >
            {group.label}
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Trend Chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {selectedMetricDef?.label || 'Metric'} Trend
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {granularity.charAt(0).toUpperCase() + granularity.slice(1)} view
              </p>
            </div>
            <select
              className="form-select"
              style={{ width: 200 }}
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
            >
              {METRIC_DEFINITIONS.map((def) => (
                <option key={def.key} value={def.key}>
                  {def.label}
                </option>
              ))}
            </select>
          </div>
          <TrendLineChart
            data={trendData}
            lines={[{ key: 'Total', label: 'Total' }]}
            format={selectedMetricDef?.format}
          />
        </div>

        {/* Top Restaurants Bar Chart */}
        <div className="glass-card p-5">
          <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Top Restaurants
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            By {selectedMetricDef?.label || 'metric'}
          </p>
          <ComparisonBarChart
            data={restaurantRanking}
            format={selectedMetricDef?.format}
            layout="horizontal"
            height={280}
          />
        </div>
      </div>

      {/* Restaurant Table */}
      <div className="glass-card overflow-hidden mb-8">
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Restaurant Performance
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {tableData.length} restaurants • Click a restaurant for details
            </p>
          </div>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: 500 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Restaurant</th>
                <th>City</th>
                {displayMetrics.map((def) => (
                  <th key={def.key} style={{ minWidth: 120, textAlign: 'right' }}>
                    {def.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => (
                <tr
                  key={row.restaurant.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/restaurant/${row.restaurant.id}`)}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-primary)' }}
                      >
                        {row.restaurant.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {row.restaurant.name}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {row.restaurant.subzone}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs">{row.restaurant.city}</td>
                  {displayMetrics.map((def) => (
                    <td key={def.key} style={{ textAlign: 'right' }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {formatMetricValue(row.metrics[def.key] || 0, def.format)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
