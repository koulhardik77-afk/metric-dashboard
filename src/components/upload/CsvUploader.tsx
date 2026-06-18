'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileCheck, AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { parseZomatoCsv } from '@/lib/parser/csvParser';
import { upsertMetricRecords, upsertRestaurants, addUploadRecord } from '@/lib/db/database';
import type { ParseResult } from '@/types';

interface CsvUploaderProps {
  onUploadComplete?: () => void;
  /**
   * When provided, the component will also push the CSV to Vercel Blob
   * using this value as the x-admin-secret header.
   * When omitted, only local IndexedDB is updated (no cloud upload).
   */
  adminSecret?: string;
}

export default function CsvUploader({ onUploadComplete, adminSecret }: CsvUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(10);
    setResult(null);
    setSavedCount(0);
    setCloudSynced(null);

    try {
      // Step 1: Parse CSV
      setProgress(20);
      const parseResult = await parseZomatoCsv(file);
      setProgress(50);

      if (!parseResult.success) {
        setResult(parseResult);
        setIsProcessing(false);
        return;
      }

      // Step 2: Save restaurants to local IndexedDB
      setProgress(60);
      await upsertRestaurants(parseResult.restaurants);

      // Step 3: Save metric records to local IndexedDB
      setProgress(70);
      const count = await upsertMetricRecords(parseResult.records);
      setSavedCount(count);
      setProgress(80);

      // Step 4: Log upload record locally
      await addUploadRecord({
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        dateRangeStart: parseResult.dateRange.start,
        dateRangeEnd: parseResult.dateRange.end,
        restaurantCount: parseResult.restaurants.length,
        recordCount: count,
        status: parseResult.warnings.length > 0 ? 'partial' : 'success',
        errors: parseResult.errors,
        warnings: parseResult.warnings,
      });

      // Step 5: Push to Vercel Blob only when an admin secret is provided
      setProgress(90);
      if (adminSecret) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/upload-csv', {
            method: 'POST',
            headers: { 'x-admin-secret': adminSecret },
            body: formData,
          });
          setCloudSynced(res.ok);
        } catch {
          setCloudSynced(false);
          console.warn('Cloud upload failed');
        }
      }

      setProgress(100);
      setResult(parseResult);
      onUploadComplete?.();
    } catch (err) {
      setResult({
        success: false,
        restaurants: [],
        records: [],
        dateRange: { start: '', end: '' },
        detectedGranularity: 'daily',
        errors: [`Processing error: ${err instanceof Error ? err.message : 'Unknown error'}`],
        warnings: [],
        totalRows: 0,
        processedRows: 0,
        skippedRows: 0,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [onUploadComplete, adminSecret]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div>
      {/* Upload Zone */}
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={48} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Processing your data...
            </p>
            <div className="w-64">
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {progress < 30 ? 'Parsing CSV...' :
                 progress < 60 ? 'Validating metrics...' :
                 progress < 80 ? 'Saving records...' :
                 progress < 95 ? 'Syncing to cloud...' : 'Complete!'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(6, 182, 212, 0.1)' }}
            >
              <Upload size={28} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Drop your Zomato CSV here
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                or click to browse • Supports daily and monthly business reports
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <FileSpreadsheet size={14} style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                CSV files only • Max file size: 50MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="mt-6 animate-fade-in" style={{ opacity: 0 }}>
          {result.success ? (
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg" style={{ background: 'var(--success-bg)' }}>
                  <FileCheck size={20} style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--success)' }}>
                    Upload Successful
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {adminSecret
                      ? cloudSynced
                        ? 'Data saved locally and synced to cloud — all visitors will see this data.'
                        : 'Data saved locally. Cloud sync failed — check your connection.'
                      : 'Data has been processed and is ready for analysis.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBox label="Restaurants" value={result.restaurants.length.toString()} />
                <StatBox label="Records Saved" value={savedCount.toString()} />
                <StatBox label="Date Range" value={`${result.dateRange.start} → ${result.dateRange.end}`} />
                <StatBox label="Granularity" value={result.detectedGranularity === 'daily' ? 'Daily' : 'Monthly'} />
              </div>

              {result.warnings.length > 0 && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--warning-bg)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--warning)' }}>Warnings</p>
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg" style={{ background: 'var(--danger-bg)' }}>
                  <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--danger)' }}>Upload Failed</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Please fix the errors and try again
                  </p>
                </div>
              </div>
              {result.errors.map((err, i) => (
                <p key={i} className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>• {err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}
