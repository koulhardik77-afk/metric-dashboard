'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '@/components/layout/DashboardShell';
import Header from '@/components/layout/Header';
import CsvUploader from '@/components/upload/CsvUploader';
import {
  ShieldCheck,
  ShieldOff,
  Cloud,
  CloudOff,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Eye,
  EyeOff,
  Database,
} from 'lucide-react';

const SESSION_KEY = 'zp_admin_secret';

interface BlobInfo {
  url: string;
  uploadedAt: string;
  size: number;
  pathname: string;
}

// ─── Login Gate ─────────────────────────────────────────────
function LoginGate({ onLogin }: { onLogin: (secret: string) => void }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError('');

    // Verify secret against the API by making a probe DELETE (no blobs will be
    // deleted since it will 401 first if wrong, and 200 with deleted:0 if right)
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: value }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, value);
        onLogin(value);
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] animate-fade-in" style={{ opacity: 0 }}>
      {/* Icon */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))', border: '1px solid rgba(251,191,36,0.2)' }}
      >
        <ShieldCheck size={36} className="text-amber-400" />
      </div>

      <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Admin Access
      </h2>
      <p className="text-sm mb-8 text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
        Enter your admin password to manage shared dashboard data.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-3">
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder="Admin password"
            className="form-input w-full pr-10"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
            tabIndex={-1}
          >
            {show
              ? <EyeOff size={16} style={{ color: 'var(--text-muted)' }} />
              : <Eye size={16} style={{ color: 'var(--text-muted)' }} />}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--danger-bg)' }}>
            <AlertCircle size={14} style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="btn-primary w-full justify-center"
          style={{ opacity: loading || !value.trim() ? 0.6 : 1 }}
        >
          {loading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <ShieldCheck size={16} />
          )}
          {loading ? 'Verifying...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

// ─── Admin Panel ─────────────────────────────────────────────
interface StatusInfo {
  ok: boolean;
  blobConnected: boolean;
  adminSecretSet: boolean;
  error?: string;
  blobCount?: number;
  latestUploadedAt?: string | null;
  latestSize?: number | null;
}

function AdminPanel({ secret, onLogout }: { secret: string; onLogout: () => void }) {
  const [blobs, setBlobs] = useState<BlobInfo[]>([]);
  const [blobLoading, setBlobLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<'success' | 'error' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<StatusInfo | null>(null);

  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ ok: false, blobConnected: false, adminSecretSet: false, error: 'Could not reach /api/admin/status' }));
  }, [refreshKey]);

  const fetchBlobInfo = useCallback(async () => {
    setBlobLoading(true);
    try {
      const res = await fetch('/api/latest-data');
      const data = await res.json();
      setBlobs(data.blobs ?? []);
    } catch {
      setBlobs([]);
    } finally {
      setBlobLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlobInfo();
  }, [fetchBlobInfo, refreshKey]);

  const handleDeleteOne = async (url: string) => {
    if (!confirm('Delete this file? Visitors who have already synced this data will keep it locally, but new visitors won\'t get this data.')) return;
    setDeletingUrl(url);
    try {
      const res = await fetch(`/api/upload-csv?url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': secret },
      });
      if (res.ok) setRefreshKey((k) => k + 1);
    } finally {
      setDeletingUrl(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL shared CSV files? New visitors will see an empty dashboard until you upload new data. Continue?')) return;
    setClearing(true);
    setClearResult(null);
    try {
      const res = await fetch('/api/upload-csv', {
        method: 'DELETE',
        headers: { 'x-admin-secret': secret },
      });
      setClearResult(res.ok ? 'success' : 'error');
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      setClearResult('error');
    } finally {
      setClearing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalSize = blobs.reduce((s, b) => s + b.size, 0);

  return (
    <>
      <Header
        title="Admin Panel"
        subtitle="Manage shared dashboard data for all visitors"
        onMenuClick={() => {}}
        actions={
          <button onClick={onLogout} className="btn-secondary text-sm" style={{ color: 'var(--text-muted)' }}>
            <LogOut size={14} />
            Logout
          </button>
        }
      />

      {/* ── Configuration Diagnostic Banner ── */}
      {status && !status.ok && (
        <div
          className="glass-card p-4 mb-6 flex items-start gap-3 animate-fade-in"
          style={{ opacity: 0, border: '1px solid rgba(239,68,68,0.4)', background: 'var(--danger-bg)' }}
        >
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--danger)' }}>
              Blob storage is not configured — uploads will fail
            </p>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{status.error}</p>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Fix: Vercel Dashboard → <strong>Settings → Environment Variables</strong> → add{' '}
              <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'rgba(0,0,0,0.3)' }}>BLOB_READ_WRITE_TOKEN</code>
              , then redeploy.
            </p>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in" style={{ opacity: 0 }}>
        <div className="kpi-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)' }}>
              <ShieldCheck size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Admin Session</p>
              <p className="text-sm font-bold text-amber-400">Active</p>
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: status?.blobConnected ? 'var(--success-bg)' : 'var(--danger-bg)' }}>
              {blobLoading
                ? <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                : status?.blobConnected
                  ? <Cloud size={18} style={{ color: 'var(--success)' }} />
                  : <CloudOff size={18} style={{ color: 'var(--danger)' }} />
              }
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cloud Storage</p>
              <p className="text-sm font-bold" style={{ color: status?.blobConnected ? 'var(--success)' : 'var(--danger)' }}>
                {blobLoading ? 'Checking...' : status?.blobConnected ? 'Connected' : 'Not configured'}
              </p>
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <Database size={18} style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {blobs.length} file{blobs.length !== 1 ? 's' : ''} stored
              </p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {blobLoading ? '—' : blobs.length > 0 ? formatBytes(totalSize) : '0 B'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="glass-card p-6 mb-8 animate-fade-in" style={{ opacity: 0, animationDelay: '0.05s' }}>
        <div className="mb-5">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Upload New Data
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Each upload is stored separately. All files are merged when visitors load the dashboard — records for the same restaurant and date are automatically deduplicated.
          </p>
        </div>
        <CsvUploader
          adminSecret={secret}
          onUploadComplete={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Stored Files Table */}
      <div className="glass-card overflow-hidden mb-8 animate-fade-in" style={{ opacity: 0, animationDelay: '0.1s' }}>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Stored CSV Files
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {blobLoading ? 'Loading...' : blobs.length === 0 ? 'No files uploaded yet' : `${blobs.length} file(s) • ${formatBytes(totalSize)} total`}
            </p>
          </div>
          {blobs.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="btn-secondary text-xs"
              style={{ color: 'var(--danger)', opacity: clearing ? 0.6 : 1 }}
            >
              {clearing ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Clear All
            </button>
          )}
        </div>

        {blobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th style={{ textAlign: 'right' }}>Size</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {blobs.map((blob, i) => (
                  <tr key={blob.url}>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{blobs.length - i}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet size={14} style={{ color: 'var(--accent-primary)' }} />
                        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {blob.pathname.replace('dashboard-data/', '')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Clock size={10} />
                        {new Date(blob.uploadedAt).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatBytes(blob.size)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteOne(blob.url)}
                        disabled={deletingUrl === blob.url}
                        className="btn-secondary text-xs"
                        style={{ color: 'var(--danger)', opacity: deletingUrl === blob.url ? 0.6 : 1 }}
                      >
                        {deletingUrl === blob.url
                          ? <RefreshCw size={10} className="animate-spin" />
                          : <Trash2 size={10} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !blobLoading && (
          <div className="p-8 text-center">
            <CloudOff size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No files uploaded yet. Use the uploader above.</p>
          </div>
        )}

        {clearResult === 'success' && (
          <div className="p-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--success-bg)' }}>
            <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--success)' }}>All cloud data cleared successfully.</p>
          </div>
        )}
        {clearResult === 'error' && (
          <div className="p-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--danger-bg)' }}>
            <AlertCircle size={12} style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>Failed to clear. Check your connection.</p>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="glass-card p-6 animate-fade-in" style={{ opacity: 0, animationDelay: '0.15s' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          How it works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Admin uploads CSVs', desc: 'Each upload is stored as a separate file in Vercel Blob — nothing is overwritten.' },
            { step: '2', title: 'All data is merged', desc: 'Visitors receive all files and they\'re merged client-side. Duplicate records (same restaurant + date) are deduplicated automatically.' },
            { step: '3', title: 'Historical insights', desc: 'Because all uploads accumulate, trends and cumulative metrics grow over time as you upload new reports.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: 'var(--accent-gradient)', color: 'white' }}
              >
                {step}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


// ─── Page ─────────────────────────────────────────────────────
export default function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);

  // Check session storage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setSecret(stored);
  }, []);

  const handleLogin = (s: string) => setSecret(s);
  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSecret(null);
  };

  return (
    <DashboardShell>
      {secret
        ? <AdminPanel secret={secret} onLogout={handleLogout} />
        : <LoginGate onLogin={handleLogin} />
      }
    </DashboardShell>
  );
}
