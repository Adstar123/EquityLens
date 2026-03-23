import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  };
  scored_at: string;
}

export interface RatioResult {
  key: string;
  name: string;
  value: number;
  range_bucket: string;
  points: number;
  weight: number;
  weighted_score: number;
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
    return this.http.get<Sector[]>(`${this.baseUrl}/sectors`);
  }

  getSectorRankings(sectorId: string): Observable<Score[]> {
    return this.http.get<Score[]>(`${this.baseUrl}/sectors/${sectorId}/rankings`);
  }

  screener(params: Record<string, string> = {}): Observable<ScreenerItem[]> {
    return this.http.get<ScreenerItem[]>(`${this.baseUrl}/screener`, { params });
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
}
