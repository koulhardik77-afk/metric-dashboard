/**
 * Payout File Parser
 * Supports CSV and XLSX uploads.
 * Extracts the six required metrics with fuzzy column-name matching
 * so future payout file formats work without code changes.
 */

// ─── Metric definitions ───────────────────────────────────────────────────────

export interface PayoutMetrics {
  numberOfOrders: number | null;
  netOrderValue: number | null;
  serviceAndPaymentFees: number | null;
  governmentCharges: number | null;
  investmentGrowthServices: number | null;
  investmentHyperpure: number | null;
}

export interface PayoutParseResult {
  success: boolean;
  metrics: PayoutMetrics;
  fileName: string;
  errors: string[];
}

// ─── Column-name patterns for fuzzy matching ──────────────────────────────────
// Each entry is a tuple: [metricKey, array-of-lowercase-patterns-to-match]
const COLUMN_PATTERNS: [keyof PayoutMetrics, string[]][] = [
  [
    'numberOfOrders',
    [
      'number of orders',
      'no of orders',
      'no. of orders',
      '#orders',
      'order count',
      'total orders',
      'orders',
    ],
  ],
  [
    'netOrderValue',
    [
      'net order value',
      'net value',
      'net order amount',
      'net sales',
      'net revenue',
      'order value',
      'net payout',
    ],
  ],
  [
    'serviceAndPaymentFees',
    [
      'service fees and payment mechanism fee',
      'service fee and payment mechanism fee',
      'service fees & payment mechanism fee',
      'service fee & payment mechanism fee',
      'service and payment fee',
      'service fees',
      'service fee',
      'platform fee',
      'payment mechanism fee',
      'commission',
    ],
  ],
  [
    'governmentCharges',
    [
      'government charges',
      'govt charges',
      'govt. charges',
      'government tax',
      'gst',
      'tax',
      'taxes',
      'government fees',
    ],
  ],
  [
    'investmentGrowthServices',
    [
      'investment in growth services',
      'growth services',
      'growth service investment',
      'growth investment',
      'marketing spend',
      'ads spend',
      'growth spend',
    ],
  ],
  [
    'investmentHyperpure',
    [
      'investment in hyperpure',
      'hyperpure investment',
      'hyperpure',
      'hyperpure spend',
      'hyperpure charges',
    ],
  ],
];

// ─── Helper: normalise a column header for matching ──────────────────────────
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Helper: find which metric key a column header maps to ───────────────────
function matchColumn(header: string): keyof PayoutMetrics | null {
  const norm = normalise(header);
  for (const [key, patterns] of COLUMN_PATTERNS) {
    for (const pattern of patterns) {
      if (norm === pattern || norm.includes(pattern)) {
        return key;
      }
    }
  }
  return null;
}

// ─── Helper: parse a numeric value from a cell (handles commas, ₹, etc.) ─────
function parseNumeric(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw)
    .replace(/[₹,$€£\s]/g, '')
    .replace(/,/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Helper: sum a column across all data rows ───────────────────────────────
function sumColumn(rows: Record<string, unknown>[], col: string): number | null {
  let total: number | null = null;
  for (const row of rows) {
    const val = parseNumeric(row[col]);
    if (val !== null) {
      total = (total ?? 0) + val;
    }
  }
  return total;
}

// ─── Main parse function ──────────────────────────────────────────────────────
export async function parsePayoutFile(file: File): Promise<PayoutParseResult> {
  const emptyMetrics: PayoutMetrics = {
    numberOfOrders: null,
    netOrderValue: null,
    serviceAndPaymentFees: null,
    governmentCharges: null,
    investmentGrowthServices: null,
    investmentHyperpure: null,
  };

  try {
    const ext = file.name.split('.').pop()?.toLowerCase();

    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];

    if (ext === 'csv') {
      ({ headers, rows } = await parseCsv(file));
    } else if (ext === 'xlsx' || ext === 'xls') {
      ({ headers, rows } = await parseXlsx(file));
    } else {
      return {
        success: false,
        metrics: emptyMetrics,
        fileName: file.name,
        errors: ['Unsupported file format. Please upload a CSV or XLSX file.'],
      };
    }

    if (headers.length === 0) {
      return {
        success: false,
        metrics: emptyMetrics,
        fileName: file.name,
        errors: ['No headers found in the uploaded file.'],
      };
    }

    // Map headers → metric keys
    const colMap: Record<string, keyof PayoutMetrics> = {};
    for (const h of headers) {
      const key = matchColumn(h);
      if (key && !(key in Object.fromEntries(Object.entries(colMap).map(([, v]) => [v, true])))) {
        colMap[h] = key;
      }
    }

    // Build result: sum each mapped column across all rows
    const metrics: PayoutMetrics = { ...emptyMetrics };

    for (const [col, metricKey] of Object.entries(colMap)) {
      // Only set if not already set (first match wins)
      if (metrics[metricKey] === null) {
        metrics[metricKey] = sumColumn(rows, col);
      }
    }

    return {
      success: true,
      metrics,
      fileName: file.name,
      errors: [],
    };
  } catch (err) {
    return {
      success: false,
      metrics: emptyMetrics,
      fileName: file.name,
      errors: [`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`],
    };
  }
}

// ─── CSV parser (using PapaParse) ────────────────────────────────────────────
async function parseCsv(
  file: File
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const Papa = (await import('papaparse')).default;
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        resolve({ headers, rows: result.data as Record<string, unknown>[] });
      },
      error: (err: { message: string }) => reject(new Error(err.message)),
    });
  });
}

// ─── XLSX parser ─────────────────────────────────────────────────────────────
async function parseXlsx(
  file: File
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array of arrays to detect headers manually
  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  }) as unknown[][];

  if (raw.length === 0) return { headers: [], rows: [] };

  // Find the first row that has at least 2 non-empty cells — treat as header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const nonEmpty = raw[i].filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (raw[headerRowIdx] as unknown[]).map((h) => String(h ?? '').trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? null;
    });
    rows.push(obj);
  }

  return { headers, rows };
}
