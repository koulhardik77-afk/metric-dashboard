'use client';

import { useState, useCallback, useRef } from 'react';
import DashboardShell from '@/components/layout/DashboardShell';
import Header from '@/components/layout/Header';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
  DollarSign,
  CreditCard,
  Landmark,
  Megaphone,
  Package,
  RefreshCcw,
} from 'lucide-react';
import { parsePayoutFile, type PayoutMetrics, type PayoutParseResult } from '@/lib/payouts/payoutParser';

// ─── Metric display config ────────────────────────────────────────────────────
interface MetricConfig {
  key: keyof PayoutMetrics;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  isCurrency: boolean;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'numberOfOrders',
    label: 'Number of Orders',
    icon: <ShoppingBag size={20} />,
    accentColor: '#0891b2',
    bgColor: 'rgba(8, 145, 178, 0.1)',
    isCurrency: false,
  },
  {
    key: 'netOrderValue',
    label: 'Net Order Value',
    icon: <DollarSign size={20} />,
    accentColor: '#7c3aed',
    bgColor: 'rgba(124, 58, 237, 0.1)',
    isCurrency: true,
  },
  {
    key: 'serviceAndPaymentFees',
    label: 'Service Fees & Payment Mechanism Fee',
    icon: <CreditCard size={20} />,
    accentColor: '#d97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
    isCurrency: true,
  },
  {
    key: 'governmentCharges',
    label: 'Government Charges',
    icon: <Landmark size={20} />,
    accentColor: '#dc2626',
    bgColor: 'rgba(220, 38, 38, 0.1)',
    isCurrency: true,
  },
  {
    key: 'investmentGrowthServices',
    label: 'Investment in Growth Services',
    icon: <Megaphone size={20} />,
    accentColor: '#16a34a',
    bgColor: 'rgba(22, 163, 74, 0.1)',
    isCurrency: true,
  },
  {
    key: 'investmentHyperpure',
    label: 'Investment in Hyperpure',
    icon: <Package size={20} />,
    accentColor: '#db2777',
    bgColor: 'rgba(219, 39, 119, 0.1)',
    isCurrency: true,
  },
];

// ─── Formatter ────────────────────────────────────────────────────────────────
function formatValue(value: number | null, isCurrency: boolean): string {
  if (value === null) return 'Data Not Available';
  if (isCurrency) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-IN').format(value);
}

// ─── Payout KPI Card ──────────────────────────────────────────────────────────
function PayoutKpiCard({
  config,
  value,
  delay,
}: {
  config: MetricConfig;
  value: number | null;
  delay: number;
}) {
  const unavailable = value === null;

  return (
    <div
      className="kpi-card animate-fade-in"
      style={{
        animationDelay: `${delay * 0.1}s`,
        opacity: 0,
        borderTop: `2px solid ${config.accentColor}`,
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <p
          className="text-xs font-semibold uppercase tracking-wider pr-2"
          style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}
        >
          {config.label}
        </p>
        <div
          className="flex-shrink-0 p-2 rounded-lg"
          style={{ background: config.bgColor, color: config.accentColor }}
        >
          {config.icon}
        </div>
      </div>

      <p
        className="text-2xl font-bold"
        style={{
          color: unavailable ? 'var(--text-muted)' : 'var(--text-primary)',
          fontStyle: unavailable ? 'italic' : 'normal',
        }}
      >
        {formatValue(value, config.isCurrency)}
      </p>

      {unavailable && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Column not found in uploaded file
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PayoutsPage() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PayoutParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setResult(null);
    try {
      const parsed = await parsePayoutFile(file);
      setResult(parsed);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so same file can be re-uploaded
      e.target.value = '';
    },
    [processFile]
  );

  const handleReset = () => {
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <DashboardShell>
      <Header title="Payouts" subtitle="Upload payout files to view key financial metrics" onMenuClick={() => {}} />

      {/* Upload Zone */}
      {!result && (
        <div
          className={`upload-zone mb-8 ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          style={{ cursor: isProcessing ? 'default' : 'pointer' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2
                size={48}
                className="animate-spin"
                style={{ color: 'var(--accent-primary)' }}
              />
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Analysing payout file…
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Extracting metrics from your file
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(8, 145, 178, 0.1)' }}
              >
                <Upload size={32} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Upload Payout File
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Drag & drop or click to browse
                </p>
              </div>
              <div
                className="flex items-center gap-6 mt-1 px-6 py-3 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={14} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    CSV
                  </span>
                </div>
                <div
                  className="w-px h-4"
                  style={{ background: 'var(--border-default)' }}
                />
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={14} style={{ color: 'var(--accent-secondary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Excel (.xlsx)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {result && !result.success && (
        <div className="glass-card p-6 mb-8 animate-fade-in" style={{ opacity: 0 }}>
          <div className="flex items-start gap-4">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{ background: 'var(--danger-bg)' }}
            >
              <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
            </div>
            <div className="flex-1">
              <p className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>
                Failed to Parse File
              </p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {err}
                </p>
              ))}
            </div>
            <button
              onClick={handleReset}
              className="btn-secondary text-xs flex items-center gap-2 flex-shrink-0"
              style={{ padding: '8px 14px' }}
            >
              <RefreshCcw size={13} />
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Success state */}
      {result && result.success && (
        <>
          {/* File info banner */}
          <div
            className="flex items-center justify-between p-4 rounded-xl mb-6 animate-fade-in"
            style={{ opacity: 0, background: 'rgba(22, 163, 74, 0.06)', border: '1px solid rgba(22, 163, 74, 0.2)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ background: 'var(--success-bg)' }}
              >
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                  File Processed Successfully
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {result.fileName}
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="btn-secondary text-xs flex items-center gap-2"
              style={{ padding: '8px 14px' }}
            >
              <RefreshCcw size={13} />
              Upload New File
            </button>
          </div>

          {/* Metric KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {METRIC_CONFIGS.map((config, i) => (
              <PayoutKpiCard
                key={config.key}
                config={config}
                value={result.metrics[config.key]}
                delay={i}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state hint */}
      {!result && !isProcessing && (
        <div className="text-center mt-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Supported columns are intelligently detected — column names do not need to match exactly.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
