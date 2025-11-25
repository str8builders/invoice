import { LineItem, Totals } from '../types';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const calculateLineAmount = (hours: number, rate: number): number => {
  return Math.round(hours * rate);
};

/**
 * Formats a Date object or string to 'YYYY-MM-DD' (ISO) for input[type="date"].
 */
export const formatDateToISO = (dateObj: Date = new Date()): string => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Formats a YYYY-MM-DD string to DD/MM/YYYY for display/PDF.
 */
export const formatDateForDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  // Check if it matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

/**
 * Tries to convert various date formats (DD/MM/YYYY, etc) to YYYY-MM-DD.
 */
export const normalizeDateToISO = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Already ISO YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fallback to Date parsing (caution: locale dependent, but handles valid ISO or long dates)
  const timestamp = Date.parse(dateStr);
  if (!isNaN(timestamp)) {
      return new Date(timestamp).toISOString().split('T')[0];
  }
  
  return dateStr;
};

/**
 * Back-calculates metrics based on a target amount.
 * Rules:
 * 1. Rate must be either 60 or 65.
 * 2. Hours must be a whole number (minimum 1).
 * 3. Choose the Rate/Hour combo that produces a total closest to the target Amount.
 * 4. Return the new snapped Amount as well.
 */
export const calculateMetricsFromAmount = (targetAmount: number) => {
  if (targetAmount === 0) return { hours: 0, rate: 65, amount: 0 };

  const rateOptions = [60, 65];
  let bestOption = { hours: 0, rate: 65, amount: 0, diff: Infinity };

  for (const rate of rateOptions) {
    let hours = Math.round(targetAmount / rate);
    if (hours < 1) hours = 1;

    const calculatedAmount = hours * rate;
    const diff = Math.abs(targetAmount - calculatedAmount);

    // We accept the first best fit. If diffs are equal, the first one encountered (60) wins 
    // unless we strictly check < vs <=. 
    // Let's stick to strict < to prefer 60 in tie-breaks if 60 is checked first.
    if (diff < bestOption.diff) {
      bestOption = { hours, rate, amount: calculatedAmount, diff };
    }
  }

  return { 
    hours: bestOption.hours, 
    rate: bestOption.rate, 
    amount: bestOption.amount 
  };
};

export const calculateTotals = (items: LineItem[]): Totals => {
  const gross = items.reduce((sum, item) => sum + item.amount, 0);
  
  const serviceItems = items.filter(i => i.type === 'service');
  const serviceGross = serviceItems.reduce((sum, item) => sum + item.amount, 0);
  
  // Rules:
  // Included GST (15 percent) = Applied ONLY to SERVICE/LABOR items (as per request to remove from expenses).
  // Included Tax (20 percent) = Applied ONLY to SERVICE/LABOR items.
  // Client to Pay (Total Including Tax & GST) = Gross + GST.
  // Net After Tax & GST (You Keep) = Gross − Tax.

  const gst = Math.round(serviceGross * 0.15);
  const tax = Math.round(serviceGross * 0.20);
  
  const clientToPay = gross + gst;
  const net = gross - tax;

  return {
    gross,
    gst,
    tax,
    clientToPay,
    net
  };
};