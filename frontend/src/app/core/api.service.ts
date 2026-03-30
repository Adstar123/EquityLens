import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Company {
  id: string;
  symbol: string;
  name: string;
  sector_id: string | null;
  market_cap: number | null;
}

export interface Score {
  id: string;
  company_id: string;
  composite_score: number;
  rating: string;
  breakdown: {
    ratios: RatioResult[];
    context_ratios?: ContextRatio[];
  };
  scored_at: string;
}

export interface RatioResult {
  key: string;
  name: string;
  description?: string;
  value: number;
  range_bucket: string;
  points: number;
  weight: number;
  weighted_score: number;
}

export interface ContextRatio {
  key: string;
  name: string;
  value: number;
}

export interface Sector {
  id: string;
  key: string;
  display_name: string;
  description: string;
}

export interface TickerDetail {
  company: Company;
  score: Score | null;
}

export interface ScreenerItem {
  symbol: string;
  company_name: string;
  sector_key: string;
  sector_name: string;
  composite_score: number;
  rating: string;
  breakdown: {
    ratios: RatioResult[];
  };
  scored_at: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  market_cap: number;
  prev_close: number;
  fetched_at: string;
}

export interface Definition {
  key: string;
  label: string;
  description: string;
  updated_at: string;
}

export interface RangeConfig {
  min?: number | null;
  max?: number | null;
}

export interface RangeSetConfig {
  strong: RangeConfig;
  good: RangeConfig;
  neutral: RangeConfig;
  weak: RangeConfig;
  poor: RangeConfig;
}

export interface RatioConfig {
  key: string;
  name: string;
  description?: string;
  weight: number;
  lower_is_better: boolean;
  ranges: RangeSetConfig;
}

export interface EdgeCasesConfig {
  negative_earnings: string;
  missing_data_threshold: number;
}

export interface RatingScaleConfig {
  strong_buy: RangeConfig;
  buy: RangeConfig;
  hold: RangeConfig;
  sell: RangeConfig;
  strong_sell: RangeConfig;
}

export interface SectorConfig {
  sector: string;
  display_name: string;
  ratios: RatioConfig[];
  edge_cases: EdgeCasesConfig;
  rating_scale: RatingScaleConfig;
}

export interface SectorWithConfig {
  sector: Sector;
  active_config: ConfigVersionRow | null;
}

export interface ConfigVersionRow {
  id: string;
  sector_id: string;
  version: number;
  config_json: SectorConfig;
  is_active: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PreviewResult {
  current: PreviewScore[];
  preview: PreviewScore[];
}

export interface PreviewScore {
  symbol: string;
  company_name: string;
  composite_score: number;
  rating: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;
  private sectorsCache$?: Observable<Sector[]>;
  private screenerCache = new Map<string, { data: ScreenerItem[]; ts: number }>();
  private readonly CACHE_TTL = 60_000; // 1 minute

  // Public
  searchTickers(query: string): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.baseUrl}/tickers`, { params: { q: query } });
  }

  getTickerDetail(symbol: string): Observable<TickerDetail> {
    return this.http.get<TickerDetail>(`${this.baseUrl}/tickers/${symbol}`);
  }

  getTickerScores(symbol: string): Observable<Score> {
    return this.http.get<Score>(`${this.baseUrl}/tickers/${symbol}/scores`);
  }

  listSectors(): Observable<Sector[]> {
    if (!this.sectorsCache$) {
      this.sectorsCache$ = this.http.get<Sector[]>(`${this.baseUrl}/sectors`).pipe(
        shareReplay(1)
      );
    }
    return this.sectorsCache$;
  }

  getSectorRankings(sectorId: string): Observable<Score[]> {
    return this.http.get<Score[]>(`${this.baseUrl}/sectors/${sectorId}/rankings`);
  }

  screener(params: Record<string, string> = {}): Observable<ScreenerItem[]> {
    const key = params['sector'] || '__all__';
    const cached = this.screenerCache.get(key);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return new Observable<ScreenerItem[]>(sub => {
        sub.next(cached.data);
        sub.complete();
      });
    }
    return this.http.get<ScreenerItem[]>(`${this.baseUrl}/screener`, { params }).pipe(
      tap(data => this.screenerCache.set(key, { data, ts: Date.now() }))
    );
  }

  // Quotes (live prices)
  getQuote(symbol: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.baseUrl}/quotes/${symbol}`);
  }

  getQuotes(symbols: string[]): Observable<Record<string, Quote>> {
    const joined = symbols.join(',');
    return this.http.get<Record<string, Quote>>(`${this.baseUrl}/quotes`, { params: { symbols: joined } });
  }

  getDefinitions(): Observable<Definition[]> {
    return this.http.get<Definition[]>(`${this.baseUrl}/definitions`);
  }

  // Authenticated
  getWatchlist(): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.baseUrl}/watchlist`);
  }

  addToWatchlist(symbol: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/watchlist/${symbol}`, {});
  }

  removeFromWatchlist(symbol: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/watchlist/${symbol}`);
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.baseUrl}/me`);
  }

  // Admin
  getConfigs(): Observable<SectorWithConfig[]> {
    return this.http.get<SectorWithConfig[]>(`${this.baseUrl}/admin/configs`);
  }

  getConfig(sector: string): Observable<ConfigVersionRow> {
    return this.http.get<ConfigVersionRow>(`${this.baseUrl}/admin/configs/${sector}`);
  }

  updateConfig(sector: string, config: SectorConfig): Observable<ConfigVersionRow> {
    return this.http.put<ConfigVersionRow>(`${this.baseUrl}/admin/configs/${sector}`, config);
  }

  previewConfig(sector: string, config: SectorConfig): Observable<PreviewResult> {
    return this.http.post<PreviewResult>(`${this.baseUrl}/admin/configs/${sector}/preview`, config);
  }

  publishConfig(sector: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/admin/configs/${sector}/publish`, {});
  }

  getConfigVersions(sector: string): Observable<ConfigVersionRow[]> {
    return this.http.get<ConfigVersionRow[]>(`${this.baseUrl}/admin/configs/${sector}/versions`);
  }

  getAdminDefinitions(): Observable<Definition[]> {
    return this.http.get<Definition[]>(`${this.baseUrl}/admin/definitions`);
  }

  updateDefinition(key: string, data: { label: string; description: string }): Observable<Definition> {
    return this.http.put<Definition>(`${this.baseUrl}/admin/definitions/${key}`, data);
  }
}
