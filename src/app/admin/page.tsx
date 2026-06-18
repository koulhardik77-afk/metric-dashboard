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
function AdminPanel({ secret, onLogout }: { secret: string; onLogout: () => void }) {
  const [blobInfo, setBlobInfo] = useState<BlobInfo | null>(null);
  const [blobLoading, setBlobLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<'success' | 'error' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchBlobInfo = useCallback(async () => {
    setBlobLoading(true);
    try {
      const res = await fetch('/api/latest-data');
      const data = await res.json();
      if (data.url) {
        setBlobInfo({ url: data.url, uploadedAt: data.uploadedAt, size: data.size });
      } else {
        setBlobInfo(null);
      }
    } catch {
      setBlobInfo(null);
    } finally {
      setBlobLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlobInfo();
  }, [fetchBlobInfo, refreshKey]);

  const handleClearCloud = async () => {
    if (!confirm('This will delete the shared CSV from cloud storage. All existing visitors will keep their cached data, but new visitors will see an empty dashboard. Continue?')) return;
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

      {/* Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in" style={{ opacity: 0 }}>
        {/* Auth status */}
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

        {/* Cloud status */}
        <div className="kpi-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: blobInfo ? 'rgba(6,182,212,0.1)' : 'var(--danger-bg)' }}>
              {blobLoading
                ? <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                : blobInfo
                  ? <Cloud size={18} style={{ color: 'var(--accent-primary)' }} />
                  : <CloudOff size={18} style={{ color: 'var(--danger)' }} />
              }
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cloud Data</p>
              <p className="text-sm font-bold" style={{ color: blobInfo ? 'var(--accent-primary)' : 'var(--danger)' }}>
                {blobLoading ? 'Checking...' : blobInfo ? 'Available' : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* File size */}
        <div className="kpi-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <Database size={18} style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>File Size</p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {blobLoading ? '—' : blobInfo ? formatBytes(blobInfo.size) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Shared Data Info */}
      {blobInfo && (
        <div
          className="glass-card p-5 mb-8 animate-fade-in"
          style={{ opacity: 0, animationDelay: '0.05s', border: '1px solid rgba(6,182,212,0.2)' }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--success-bg)' }}>
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Shared CSV is live
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Clock size={10} />
                    Uploaded {new Date(blobInfo.uploadedAt).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatBytes(blobInfo.size)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={blobInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                <FileSpreadsheet size={12} />
                View File
              </a>
              <button
                onClick={handleClearCloud}
                disabled={clearing}
                className="btn-secondary text-xs"
                style={{ color: 'var(--danger)', opacity: clearing ? 0.6 : 1 }}
              >
                {clearing
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
                Clear Cloud Data
              </button>
            </div>
          </div>

          {clearResult === 'success' && (
            <div className="mt-3 p-2 rounded-lg flex items-center gap-2" style={{ background: 'var(--success-bg)' }}>
              <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
              <p className="text-xs" style={{ color: 'var(--success)' }}>Cloud data cleared successfully.</p>
            </div>
          )}
          {clearResult === 'error' && (
            <div className="mt-3 p-2 rounded-lg flex items-center gap-2" style={{ background: 'var(--danger-bg)' }}>
              <AlertCircle size={12} style={{ color: 'var(--danger)' }} />
              <p className="text-xs" style={{ color: 'var(--danger)' }}>Failed to clear. Check your connection or secret.</p>
            </div>
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="glass-card p-6 mb-8 animate-fade-in" style={{ opacity: 0, animationDelay: '0.1s' }}>
        <div className="mb-5">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Upload New Data
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Uploading a CSV will replace the current shared data for all future visitors. Existing visitors will see the new data on their next visit.
          </p>
        </div>
        <CsvUploader
          adminSecret={secret}
          onUploadComplete={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>

      {/* No cloud data notice */}
      {!blobLoading && !blobInfo && (
        <div
          className="glass-card p-5 text-center animate-fade-in"
          style={{ opacity: 0, animationDelay: '0.15s', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <CloudOff size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No shared data in cloud yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Upload a CSV above to make data available to all visitors.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-6 animate-fade-in" style={{ opacity: 0, animationDelay: '0.2s' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          How it works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Admin uploads CSV', desc: 'You upload the Zomato business report here. It\'s saved to Vercel Blob cloud storage.' },
            { step: '2', title: 'Data is shared', desc: 'The CSV is stored publicly (but unlisted) in the cloud, replacing any previous version.' },
            { step: '3', title: 'Visitors auto-sync', desc: 'On their first visit, the dashboard automatically fetches and imports the shared CSV into their browser.' },
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
