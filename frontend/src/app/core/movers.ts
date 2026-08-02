import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Quote, ScreenerItem } from './api.service';

export interface MoverRow {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePct: number;
  score: number | null;
  rating: string;
}

// The two halves of the "price vs the books" board: strong-rated companies
// being sold off, and weak-rated companies rallying anyway
export interface DivergenceBoard {
  strongFallers: MoverRow[];
  weakRallies: MoverRow[];
}

const STRONG_RATINGS = new Set(['strong_buy', 'buy']);
const WEAK_RATINGS = new Set(['strong_sell', 'sell']);

// The quotes endpoint takes a comma-joined symbol list; keep each request modest
const CHUNK_SIZE = 60;

export function loadMoverRows(
  api: ApiService,
  items: ScreenerItem[],
): Observable<MoverRow[]> {
  const symbols = items.map(i => i.symbol);
  if (!symbols.length) return of([]);

  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    chunks.push(symbols.slice(i, i + CHUNK_SIZE));
  }

  const bySymbol = new Map(items.map(i => [i.symbol, i] as const));

  return forkJoin(
    chunks.map(c =>
      api.getQuotes(c).pipe(catchError(() => of({} as Record<string, Quote>))),
    ),
  ).pipe(
    map(results => {
      const quotes: Record<string, Quote> = Object.assign({}, ...results);
      const rows: MoverRow[] = [];
      for (const sym of symbols) {
        const q = quotes[sym];
        if (!q || !q.price) continue;
        const item = bySymbol.get(sym);
        const scored = item && item.rating !== 'insufficient_data';
        rows.push({
          symbol: sym,
          name: item?.company_name ?? sym,
          price: '$' + q.price.toFixed(2),
          change: (q.change_pct >= 0 ? '+' : '') + q.change_pct.toFixed(2) + '%',
          changePct: q.change_pct,
          score: scored ? Math.round(item!.composite_score) : null,
          rating: item?.rating ?? 'insufficient_data',
        });
      }
      return rows;
    }),
  );
}

export function computeDivergence(rows: MoverRow[], count = 5): DivergenceBoard {
  return {
    strongFallers: rows
      .filter(r => STRONG_RATINGS.has(r.rating) && r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, count),
    weakRallies: rows
      .filter(r => WEAK_RATINGS.has(r.rating) && r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, count),
  };
}

export function topGainers(rows: MoverRow[], count = 5): MoverRow[] {
  return [...rows]
    .sort((a, b) => b.changePct - a.changePct)
    .filter(r => r.changePct > 0)
    .slice(0, count);
}
