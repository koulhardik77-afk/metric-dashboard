'use client';

import { useEffect, useState } from 'react';
import { clearAllData } from '@/lib/db/database';
import { useRouter } from 'next/navigation';

// This page auto-clears all IndexedDB data and redirects to the homepage.
// Navigate to /clear to wipe the database without any confirmation dialog.
export default function ClearPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Clearing all data...');

  useEffect(() => {
    async function clear() {
      try {
        await clearAllData();
        setStatus('✅ All data cleared! Redirecting...');
        setTimeout(() => router.push('/'), 1500);
      } catch (err) {
        setStatus(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    clear();
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontSize: '1.25rem',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      {status}
    </div>
  );
}
