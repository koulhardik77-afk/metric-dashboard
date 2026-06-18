// ============================================================
// Hook: useAdminSession
// ============================================================
// Reads the admin secret from sessionStorage. Returns the secret
// if the admin is logged in, or null if not. Safe to call on any
// page — returns null during SSR (window is undefined).
// ============================================================

import { useEffect, useState } from 'react';

const SESSION_KEY = 'zp_admin_secret';

export function useAdminSession(): string | null {
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSecret(sessionStorage.getItem(SESSION_KEY));
    } catch {
      // sessionStorage unavailable (SSR / private browsing)
      setSecret(null);
    }
  }, []);

  return secret;
}
