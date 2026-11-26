// One place for how scores and ratio bands are named and ranked, so the
// landing field, tables, badges and the ticker dial all agree.

export type Band = 'poor' | 'weak' | 'neutral' | 'good' | 'strong';

export const BANDS: Band[] = ['poor', 'weak', 'neutral', 'good', 'strong'];

export const BAND_LABELS: Record<Band, string> = {
  poor: 'Poor',
  weak: 'Weak',
  neutral: 'Neutral',
  good: 'Good',
  strong: 'Strong',
};

// Ratings come from the backend with legacy trading names; the UI never
// shows those, only the strength they map to
const RATING_TO_BAND: Record<string, Band> = {
  strong_buy: 'strong',
  buy: 'good',
  hold: 'neutral',
  sell: 'weak',
  strong_sell: 'poor',
};

const RATING_LABELS: Record<string, string> = {
  strong_buy: 'Very strong',
  buy: 'Strong',
  hold: 'Neutral',
  sell: 'Weak',
  strong_sell: 'Very weak',
  insufficient_data: 'No data',
};

export function ratingBand(rating: string | null | undefined): Band | null {
  return rating ? RATING_TO_BAND[rating] ?? null : null;
}

export function ratingLabel(rating: string | null | undefined): string {
  if (!rating) return 'No data';
  return RATING_LABELS[rating] ?? rating.replace(/_/g, ' ');
}

// 1 (poor) to 5 (strong); 0 when unknown
export function bandLevel(band: string | null | undefined): number {
  const i = BANDS.indexOf(band as Band);
  return i < 0 ? 0 : i + 1;
}

export function ratingLevel(rating: string | null | undefined): number {
  return bandLevel(ratingBand(rating));
}

export function bandVar(band: string | null | undefined): string {
  return BANDS.includes(band as Band) ? `var(--band-${band})` : 'var(--band-neutral)';
}

// Display helpers shared by every table
export function formatRatio(value: number): string {
  // Backend sentinel for debt-free interest coverage
  if (value >= 998) return 'No debt';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatPrice(price: number): string {
  return '$' + price.toFixed(2);
}

export function formatMarketCap(cap: number): string {
  if (!cap) return '';
  if (cap >= 1_000_000_000) return '$' + (cap / 1_000_000_000).toFixed(1) + 'B';
  if (cap >= 1_000_000) return '$' + (cap / 1_000_000).toFixed(0) + 'M';
  return '$' + cap.toLocaleString('en-AU');
}

export function formatChangePct(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

export function shortSymbol(symbol: string): string {
  return symbol.replace(/\.AX$/i, '');
}

export function shortName(name: string): string {
  return name
    .replace(/,?\s+(Limited|Ltd\.?|Inc\.?|Corporation|Group|Holdings)\s*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
}
