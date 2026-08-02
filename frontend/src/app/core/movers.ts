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
}

export interface Movers {
  gainers: MoverRow[];
  fallers: MoverRow[];
}

// The quotes endpoint takes a comma-joined symbol list; keep each request modest
const CHUNK_SIZE = 60;

export function loadMovers(
  api: ApiService,
  items: ScreenerItem[],
  count = 5,
): Observable<Movers> {
  const symbols = items.map(i => i.symbol);
  if (!symbols.length) return of({ gainers: [], fallers: [] });

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
        });
      }
      return {
        gainers: [...rows]
          .sort((a, b) => b.changePct - a.changePct)
          .filter(r => r.changePct > 0)
          .slice(0, count),
        fallers: [...rows]
          .sort((a, b) => a.changePct - b.changePct)
          .filter(r => r.changePct < 0)
          .slice(0, count),
      };
    }),
  );
}
