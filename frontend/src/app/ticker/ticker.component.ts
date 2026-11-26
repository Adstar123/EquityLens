import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft, lucideStar } from '@ng-icons/lucide';
import { Subscription } from 'rxjs';
import { ApiService, TickerDetail, Company, Quote, Definition, ScreenerItem, RatioResult } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import {
  bandVar,
  formatChangePct,
  formatMarketCap,
  formatPrice,
  formatRatio,
  ratingBand,
  ratingLabel,
  BAND_LABELS,
  Band,
} from '../core/bands';
import { BandMeterComponent } from '../shared/components/band-meter.component';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';

interface LedgerRow {
  key: string;
  name: string;
  description?: string;
  value: string;
  band: string;
  bandLabel: string;
  points: string;
  max: string;
  trackPct: number;
  fillPct: number;
  weighted: boolean;
}

// Dial geometry: a 220 degree sweep, measured clockwise from twelve o'clock
const DIAL = { cx: 120, cy: 116, r: 96, start: -110, end: 110 };

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: DIAL.cx + r * Math.sin(rad), y: DIAL.cy - r * Math.cos(rad) };
}

function trim(n: number): string {
  return Number.isInteger(Math.round(n * 10) / 10) ? Math.round(n).toString() : n.toFixed(1);
}

@Component({
  selector: 'app-ticker',
  standalone: true,
  imports: [RouterLink, NgIcon, BandMeterComponent, ScoreBadgeComponent, InfoTooltipComponent, TickerSearchComponent],
  template: `
    @if (loading()) {
      <div class="page" aria-busy="true">
        <div class="sk sk-back"></div>
        <div class="sk sk-title"></div>
        <div class="sk sk-meta"></div>
        <div class="grid">
          <div class="card sk-card span-5"></div>
          <div class="card sk-card span-7"></div>
        </div>
      </div>
    } @else if (detail(); as d) {
      <div class="page">
        <button class="back" (click)="goBack()">
          <ng-icon [svg]="icons.back" size="16" strokeWidth="1.5" />
          {{ backLabel() }}
        </button>

        <header class="head">
          <div class="identity">
            <h1 class="page-heading name">{{ d.company.name }}</h1>
            <div class="identity-meta">
              <span class="symbol">{{ d.company.symbol }}</span>
              @if (sectorName()) {
                <span class="dot"></span>
                <a class="sector-link" [routerLink]="['/sector', sectorKey()]">{{ sectorName() }}</a>
              }
              @if (auth.isLoggedIn()) {
                <button
                  class="ui-btn watch"
                  [class.is-on]="inWatchlist()"
                  [attr.aria-pressed]="inWatchlist()"
                  (click)="toggleWatchlist()"
                >
                  <ng-icon [svg]="icons.star" size="16" strokeWidth="1.5" />
                  {{ inWatchlist() ? 'Watching' : 'Watch' }}
                </button>
              } @else {
                <a class="ui-btn watch" routerLink="/" fragment="signin" title="Sign in to keep a watchlist">
                  <ng-icon [svg]="icons.star" size="16" strokeWidth="1.5" />
                  Watch
                </a>
              }
            </div>
          </div>

          @if (quote(); as q) {
            <div class="price">
              <div class="price-row">
                <span class="price-big">{{ fmtPrice(q.price) }}</span>
                <span class="price-chg" [class.up]="q.change > 0" [class.down]="q.change < 0">
                  {{ q.change >= 0 ? '+' : '' }}{{ fmtPrice(q.change).replace('$-', '-$') }}
                  &nbsp;{{ fmtChange(q.change_pct) }}
                </span>
              </div>
              <div class="price-meta">
                <span>Volume <b>{{ formatVolume(q.volume) }}</b></span>
                <span>
                  Market cap <b>{{ fmtCap(q.market_cap) }}</b>
                  @if (definitions()['market_cap']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                </span>
                <span>Prices update hourly</span>
              </div>
            </div>
          }
        </header>

        @if (d.score; as score) {
          <div class="grid">
            <!-- Score dial -->
            <section class="card span-5 score-card">
              <div class="card-head">
                <h2 class="card-title">
                  Composite score
                  @if (definitions()['composite_score']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                </h2>
              </div>

              <div class="dial-wrap">
                <svg class="dial" viewBox="0 0 240 176" role="img" [attr.aria-label]="'Score ' + score.composite_score.toFixed(0) + ' out of 100, ' + ratingText()">
                  @for (t of dialTicks; track t.v) {
                    <line [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" [class.major]="t.major" />
                  }
                  <path class="track" [attr.d]="arcPath" />
                  <path
                    class="value"
                    [attr.d]="arcPath"
                    pathLength="100"
                    stroke-dasharray="100"
                    [attr.stroke-dashoffset]="100 - displayScore()"
                    [style.stroke]="ratingColour()"
                  />
                  <circle class="tip" [attr.cx]="tip().x" [attr.cy]="tip().y" r="7" [style.stroke]="ratingColour()" />
                  <text class="end-label" [attr.x]="labelStart.x" [attr.y]="labelStart.y + 22" text-anchor="middle">0</text>
                  <text class="end-label" [attr.x]="labelEnd.x" [attr.y]="labelEnd.y + 22" text-anchor="middle">100</text>
                </svg>
                <div class="dial-centre">
                  <span class="dial-num">{{ displayScore() }}</span>
                  <span class="dial-rating">
                    <app-band-meter [band]="ratingBandName()" size="md" />
                    {{ ratingText() }}
                  </span>
                </div>
              </div>

              @if (sectorRank() && sectorTotal()) {
                <div class="rank">
                  <div class="rank-line">
                    <span>Ranked <b>{{ sectorRank() }}</b> of {{ sectorTotal() }} in {{ sectorName() }}</span>
                    <span class="rank-pct">Top {{ sectorPercentile() }}%</span>
                  </div>
                  <div class="strip" aria-hidden="true">
                    @for (p of sectorStrip(); track p.symbol) {
                      <a
                        class="strip-cell"
                        [class.is-self]="p.self"
                        [style.background]="p.colour"
                        [routerLink]="['/ticker', p.symbol]"
                        [title]="p.symbol + ' ' + p.score"
                        tabindex="-1"
                      ></a>
                    }
                  </div>
                </div>
              }
            </section>

            <!-- Ledger -->
            <section class="card span-7 ledger-card">
              <div class="card-head">
                <h2 class="card-title">How the score is built</h2>
                <span class="card-note">Each ratio earns up to its weight in points</span>
              </div>
              <div class="ledger" role="table" aria-label="Score breakdown">
                <div class="lg-row lg-head" role="row">
                  <span role="columnheader">Ratio</span>
                  <span role="columnheader" class="num">Value</span>
                  <span role="columnheader">Band</span>
                  <span role="columnheader" class="num">Points</span>
                </div>
                @for (row of ledger(); track row.key) {
                  <div class="lg-row" role="row">
                    <span class="lg-name" role="cell">
                      {{ row.name }}
                      @if (row.description) {
                        <app-info-tooltip [description]="row.description" />
                      }
                    </span>
                    <span class="lg-value num" role="cell">{{ row.value }}</span>
                    <span class="lg-band" role="cell">
                      <app-band-meter [band]="row.band" />
                      <span>{{ row.bandLabel }}</span>
                    </span>
                    <span class="lg-points" role="cell">
                      <span class="lg-bar">
                        <span class="lg-track" [style.width.%]="row.trackPct">
                          <b [style.width.%]="row.fillPct"></b>
                        </span>
                      </span>
                      @if (row.weighted) {
                        <span class="lg-pts"><i>{{ row.points }}</i> / {{ row.max }}</span>
                      } @else {
                        <span class="lg-pts">Not weighted</span>
                      }
                    </span>
                  </div>
                }
                <div class="lg-row lg-total" role="row">
                  <span role="cell">Composite</span>
                  <span role="cell"></span>
                  <span role="cell"></span>
                  <span class="lg-pts" role="cell"><i>{{ score.composite_score.toFixed(0) }}</i> / 100</span>
                </div>
              </div>
            </section>

            <!-- Valuation -->
            @if (contextRatios().length > 0) {
              <section class="card span-5 value-card">
                <div class="card-head">
                  <h2 class="card-title">
                    Valuation context
                    @if (definitions()['valuation_context']; as def) {
                      <app-info-tooltip [description]="def.description" />
                    }
                  </h2>
                </div>
                <div class="figures">
                  @for (ctx of contextRatios(); track ctx.key) {
                    <div class="figure">
                      <span class="fig-label">{{ ctx.name }}</span>
                      <span class="fig-value">{{ fmtRatio(ctx.value) }}</span>
                    </div>
                  }
                </div>
                <p class="note">Shown for reference only. Valuation never changes the score.</p>
              </section>
            }

            <!-- Peers -->
            @if (sectorPeers().length > 0) {
              <section class="card" [class.span-7]="contextRatios().length > 0" [class.span-12]="contextRatios().length === 0">
                <div class="card-head">
                  <h2 class="card-title">Top of {{ sectorName() }}</h2>
                  <a class="ui-link" [routerLink]="['/sector', sectorKey()]">Full ranking</a>
                </div>
                <div class="peers">
                  @for (peer of sectorPeers(); track peer.symbol) {
                    <a class="peer" [class.is-self]="peer.self" [routerLink]="['/ticker', peer.symbol]">
                      <span class="peer-rank">{{ peer.rank }}</span>
                      <span class="peer-sym">{{ peer.symbol }}</span>
                      <span class="peer-name">{{ peer.name }}</span>
                      <app-score-badge [score]="peer.score" [rating]="peer.rating" />
                    </a>
                  }
                </div>
              </section>
            }
          </div>
        } @else {
          <div class="card empty">
            <span class="empty-title">No score yet</span>
            <span class="empty-sub">This company hasn't been scored. It may be missing too many figures in its latest filings.</span>
          </div>
        }
      </div>
    } @else {
      <div class="nf">
        <p class="nf-code">Not found</p>
        <h1 class="page-heading">No ticker called {{ requestedSymbol() }}</h1>
        <p class="nf-sub">
          It may not be in the ASX&nbsp;300, or the symbol was mistyped.
          Try a search, or browse the full screener.
        </p>
        <div class="nf-search">
          <app-ticker-search placeholder="Search any ASX ticker or company" />
        </div>
        <a routerLink="/screener" class="ui-link">Open the screener</a>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 32px 64px;
    }

    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      margin: 0 0 16px -8px;
      padding: 0 8px;
      border: none;
      border-radius: var(--radius);
      background: none;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
    }

    .back:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    // ── Header ──
    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 32px;
      margin-bottom: 32px;
    }

    .name {
      font-size: 32px;
    }

    .identity-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
    }

    .symbol {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: var(--accent-ink);
    }

    .dot {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .sector-link {
      font-size: 14px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color var(--dur-fast) var(--ease);
    }

    .sector-link:hover {
      color: var(--text-primary);
    }

    .watch {
      height: 32px;
      padding: 0 12px;
      margin-left: 4px;
      color: var(--text-secondary);
    }

    .watch.is-on {
      color: var(--accent-ink);
      border-color: color-mix(in srgb, var(--accent) 40%, transparent);
      background: var(--accent-soft);
    }

    .watch.is-on ng-icon {
      fill: currentColor;
    }

    .price {
      text-align: right;
    }

    .price-row {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 12px;
    }

    .price-big {
      font-family: 'JetBrains Mono', monospace;
      font-size: 32px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .price-chg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .up { color: var(--up); }
    .down { color: var(--down); }

    .price-meta {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .price-meta b {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 400;
      color: var(--text-secondary);
    }

    // ── Grid and cards ──
    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
    }

    .span-5 { grid-column: span 5; }
    .span-7 { grid-column: span 7; }
    .span-12 { grid-column: span 12; }

    .card {
      padding: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      min-width: 0;
    }

    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }

    .card-title {
      display: flex;
      align-items: center;
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .card-note {
      font-size: 12px;
      color: var(--text-muted);
    }

    // ── Dial ──
    .score-card {
      display: flex;
      flex-direction: column;
    }

    .dial-wrap {
      position: relative;
      width: 100%;
      max-width: 320px;
      margin: 0 auto;
    }

    .dial {
      display: block;
      width: 100%;
      overflow: visible;
    }

    .dial line {
      stroke: var(--text-muted);
      stroke-width: 1;
      opacity: 0.5;
    }

    .dial line.major {
      opacity: 1;
    }

    .dial .track,
    .dial .value {
      fill: none;
      stroke-width: 10;
    }

    .dial .track {
      stroke: var(--band-off);
    }

    .dial .tip {
      fill: var(--bg-surface);
      stroke-width: 3;
    }

    .end-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      fill: var(--text-muted);
    }

    .dial-centre {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      transform: translateY(-36%);
    }

    .dial-num {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 64px;
      line-height: 1;
      letter-spacing: -0.04em;
      color: var(--text-primary);
    }

    .dial-rating {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .rank {
      margin-top: auto;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .rank-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .rank-line b {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      color: var(--text-primary);
    }

    .rank-pct {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent-ink);
      white-space: nowrap;
    }

    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }

    .strip-cell {
      width: 8px;
      height: 16px;
      border-radius: 2px;
      opacity: 0.55;
      transition: opacity var(--dur-fast) var(--ease);
    }

    .strip-cell:hover {
      opacity: 1;
    }

    .strip-cell.is-self {
      opacity: 1;
      box-shadow: 0 0 0 1.5px var(--bg-surface), 0 0 0 3px var(--text-primary);
    }

    // ── Ledger ──
    .lg-row {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) 72px minmax(0, 1fr) minmax(0, 1.4fr);
      align-items: center;
      gap: 16px;
      min-height: 44px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    .lg-head {
      min-height: 32px;
      border-top: none;
      font-size: 12px;
      color: var(--text-muted);
    }

    .num {
      text-align: right;
    }

    .lg-name {
      display: flex;
      align-items: center;
      color: var(--text-primary);
    }

    .lg-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .lg-band {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-secondary);
    }

    .lg-points {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 72px;
      align-items: center;
      gap: 12px;
    }

    .lg-bar {
      display: block;
      min-width: 0;
    }

    .lg-track {
      display: block;
      height: 6px;
      border-radius: 3px;
      background: var(--band-off);
      overflow: hidden;
    }

    .lg-track b {
      display: block;
      height: 100%;
      background: var(--accent);
    }

    .lg-pts {
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .lg-pts i {
      font-style: normal;
      color: var(--text-primary);
    }

    .lg-total {
      border-top: 1px solid var(--border-strong);
      font-weight: 500;
      color: var(--text-primary);
    }

    .lg-total .lg-pts {
      grid-column: 4;
      font-size: 13px;
    }

    .lg-total .lg-pts i {
      color: var(--accent-ink);
    }

    // ── Valuation ──
    .figures {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .figure {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .fig-label {
      font-size: 12px;
      color: var(--text-muted);
    }

    .fig-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .value-card {
      display: flex;
      flex-direction: column;
    }

    .value-card .note {
      margin-top: auto;
      padding-top: 20px;
    }

    .note {
      margin: 20px 0 0;
      font-size: 12px;
      color: var(--text-muted);
    }

    // ── Peers ──
    .peers {
      display: flex;
      flex-direction: column;
      margin: -8px -12px;
    }

    .peer {
      display: grid;
      grid-template-columns: 24px 72px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--radius);
      text-decoration: none;
      transition: background-color var(--dur-fast) var(--ease);
    }

    .peer:hover {
      background: var(--bg-hover);
    }

    .peer.is-self {
      background: var(--accent-soft);
    }

    .peer-rank {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      text-align: right;
    }

    .peer-sym {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .peer-name {
      font-size: 13px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // ── States ──
    .sk {
      border-radius: var(--radius);
      background: var(--band-off);
    }

    .sk-back { width: 64px; height: 16px; margin-bottom: 24px; }
    .sk-title { width: 320px; max-width: 80%; height: 32px; margin-bottom: 12px; }
    .sk-meta { width: 200px; height: 16px; margin-bottom: 32px; }

    .sk-card {
      height: 420px;
      opacity: 0.6;
    }

    .empty {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 48px 24px;
      text-align: center;
    }

    .empty-title {
      font-size: 15px;
      font-weight: 500;
    }

    .empty-sub {
      font-size: 13px;
      color: var(--text-muted);
    }

    .nf {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: 96px 24px;
      box-sizing: border-box;
      text-align: center;
    }

    .nf-code {
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent-ink);
    }

    .nf-sub {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .nf-search {
      width: 100%;
      margin-bottom: 8px;
    }

    @media (max-width: 1100px) {
      .span-5,
      .span-7 {
        grid-column: span 12;
      }
    }

    @media (max-width: 768px) {
      .page {
        padding: 16px 16px 48px;
      }

      .head {
        flex-direction: column;
        align-items: flex-start;
        gap: 20px;
      }

      .name {
        font-size: 26px;
      }

      .price,
      .price-row,
      .price-meta {
        text-align: left;
        justify-content: flex-start;
      }

      .card {
        padding: 20px 16px;
      }

      .card-note {
        display: none;
      }

      .lg-head {
        display: none;
      }

      .lg-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px 12px;
        padding: 12px 0;
      }

      .lg-band {
        grid-row: 2;
      }

      .lg-points {
        grid-row: 2;
      }

      .lg-total {
        grid-template-columns: 1fr auto;
      }

      .lg-total span:nth-child(2),
      .lg-total span:nth-child(3) {
        display: none;
      }

      .lg-total .lg-pts {
        grid-column: 2;
        grid-row: 1;
      }

      .lg-points {
        grid-template-columns: 64px 72px;
      }

      .figures {
        gap: 12px;
      }

      .fig-value {
        font-size: 20px;
      }

      .peer {
        grid-template-columns: 20px 56px minmax(0, 1fr) auto;
        gap: 8px;
      }
    }
  `],
})
export class TickerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private titleService = inject(Title);
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly icons = { back: lucideArrowLeft, star: lucideStar };

  definitions = signal<Record<string, Definition>>({});
  detail = signal<TickerDetail | null>(null);
  loading = signal(true);
  displayScore = signal(0);
  inWatchlist = signal(false);
  quote = signal<Quote | null>(null);
  requestedSymbol = signal('');

  // Sector context
  sectorName = signal<string | null>(null);
  sectorKey = signal<string>('');
  sectorItems = signal<ScreenerItem[]>([]);

  fmtRatio = formatRatio;
  fmtPrice = formatPrice;
  fmtCap = formatMarketCap;
  fmtChange = formatChangePct;

  // ── Dial ──
  readonly arcPath = (() => {
    const a = polar(DIAL.r, DIAL.start);
    const b = polar(DIAL.r, DIAL.end);
    return `M ${a.x} ${a.y} A ${DIAL.r} ${DIAL.r} 0 1 1 ${b.x} ${b.y}`;
  })();

  readonly dialTicks = Array.from({ length: 21 }, (_, i) => {
    const v = i * 5;
    const major = v % 25 === 0;
    const deg = DIAL.start + (v / 100) * (DIAL.end - DIAL.start);
    const p1 = polar(DIAL.r + 12, deg);
    const p2 = polar(DIAL.r + (major ? 20 : 16), deg);
    return { v, major, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  });

  readonly labelStart = polar(DIAL.r, DIAL.start);
  readonly labelEnd = polar(DIAL.r, DIAL.end);

  tip = computed(() => polar(DIAL.r, DIAL.start + (this.displayScore() / 100) * (DIAL.end - DIAL.start)));

  ratingBandName = computed(() => ratingBand(this.detail()?.score?.rating));
  ratingText = computed(() => ratingLabel(this.detail()?.score?.rating));
  ratingColour = computed(() => bandVar(this.ratingBandName()));

  // ── Sector ──
  private sortedSector = computed(() =>
    [...this.sectorItems()]
      .filter(i => i.rating !== 'insufficient_data')
      .sort((a, b) => b.composite_score - a.composite_score),
  );

  sectorTotal = computed(() => this.sortedSector().length || null);

  sectorRank = computed(() => {
    const sym = this.requestedSymbol();
    const i = this.sortedSector().findIndex(s => s.symbol.toUpperCase() === sym);
    return i >= 0 ? i + 1 : null;
  });

  // Rank 20 of 65 puts a company in the top 31% (20/65), not the top 71%
  sectorPercentile = computed(() => {
    const rank = this.sectorRank();
    const total = this.sectorTotal();
    if (!rank || !total) return 0;
    return Math.max(1, Math.round((rank / total) * 100));
  });

  sectorStrip = computed(() => {
    const sym = this.requestedSymbol();
    return this.sortedSector().map(i => ({
      symbol: i.symbol,
      score: Math.round(i.composite_score),
      colour: bandVar(ratingBand(i.rating)),
      self: i.symbol.toUpperCase() === sym,
    }));
  });

  // Top five, plus this company in place if it isn't one of them
  sectorPeers = computed(() => {
    const sym = this.requestedSymbol();
    const list = this.sortedSector().map((i, idx) => ({
      rank: idx + 1,
      symbol: i.symbol,
      name: i.company_name,
      score: i.composite_score,
      rating: i.rating,
      self: i.symbol.toUpperCase() === sym,
    }));
    const top = list.slice(0, 5);
    const self = list.find(p => p.self);
    if (self && !top.includes(self)) top.push(self);
    return top;
  });

  contextRatios = computed(() => this.detail()?.score?.breakdown?.context_ratios ?? []);

  ledger = computed<LedgerRow[]>(() => {
    const ratios: RatioResult[] = this.detail()?.score?.breakdown?.ratios ?? [];
    if (!ratios.length) return [];
    const maxWeight = Math.max(...ratios.map(r => r.weight));
    return [...ratios]
      .sort((a, b) => b.weight - a.weight)
      .map(r => {
        const max = r.weight * 100;
        const pts = r.weighted_score * 20;
        return {
          key: r.key,
          name: r.name,
          description: r.description,
          value: formatRatio(r.value),
          band: r.range_bucket,
          bandLabel: BAND_LABELS[r.range_bucket as Band] ?? r.range_bucket,
          points: trim(pts),
          max: trim(max),
          trackPct: maxWeight ? (r.weight / maxWeight) * 100 : 0,
          fillPct: max ? Math.min(100, (pts / max) * 100) : 0,
          weighted: r.weight > 0,
        };
      });
  });

  backLabel = computed(() => {
    const state = window.history.state as { navigationId?: number } | null;
    return state?.navigationId && state.navigationId > 1 ? 'Back' : 'Screener';
  });

  private paramSub?: Subscription;
  private frame = 0;

  goBack(): void {
    // Prefer real history so back returns to the exact screener or sector
    // state; fall back to the screener for direct visits
    const state = window.history.state as { navigationId?: number } | null;
    if (state?.navigationId && state.navigationId > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/screener']);
    }
  }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      const symbol = params.get('symbol');
      if (symbol) {
        this.requestedSymbol.set(symbol.toUpperCase());
        this.loadTicker(symbol);
        this.checkWatchlistStatus(symbol);
      }
    });
    this.api.getDefinitions().subscribe({
      next: (defs) => {
        const map: Record<string, Definition> = {};
        for (const d of defs) map[d.key] = d;
        this.definitions.set(map);
      },
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    cancelAnimationFrame(this.frame);
  }

  formatVolume(vol: number): string {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toLocaleString('en-AU');
  }

  toggleWatchlist(): void {
    const symbol = this.detail()?.company.symbol;
    if (!symbol) return;

    const wasInWatchlist = this.inWatchlist();
    this.inWatchlist.set(!wasInWatchlist); // optimistic

    const req = wasInWatchlist
      ? this.api.removeFromWatchlist(symbol)
      : this.api.addToWatchlist(symbol);
    req.subscribe({ error: () => this.inWatchlist.set(wasInWatchlist) });
  }

  private checkWatchlistStatus(symbol: string): void {
    if (!this.auth.isLoggedIn()) return;
    this.api.getWatchlist().subscribe({
      next: (companies: Company[]) => {
        this.inWatchlist.set(companies.some(c => c.symbol === symbol.toUpperCase()));
      },
      error: () => {},
    });
  }

  private loadTicker(symbol: string): void {
    this.loading.set(true);
    this.quote.set(null);
    this.sectorItems.set([]);
    this.sectorName.set(null);
    this.api.getTickerDetail(symbol).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.loading.set(false);
        this.titleService.setTitle(`${data.company.symbol} ${data.company.name} · EquityLens`);
        this.api.getQuote(symbol).subscribe({
          next: (q) => this.quote.set(q),
          error: () => this.quote.set(null),
        });
        if (data.score) this.animateScore(data.score.composite_score);
        if (data.company.sector_id) this.loadSectorContext(data.company.sector_id);
      },
      error: () => {
        this.detail.set(null);
        this.loading.set(false);
        this.titleService.setTitle('Ticker not found · EquityLens');
      },
    });
  }

  private loadSectorContext(sectorId: string): void {
    this.api.listSectors().subscribe({
      next: (sectors) => {
        const sector = sectors.find(s => s.id === sectorId);
        if (!sector) return;
        this.sectorName.set(sector.display_name);
        this.sectorKey.set(sector.key);
        this.api.screener({ sector: sector.key }).subscribe({
          next: (items) => this.sectorItems.set(items),
        });
      },
    });
  }

  private animateScore(target: number): void {
    cancelAnimationFrame(this.frame);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.displayScore.set(Math.round(target));
      return;
    }
    const duration = 900;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.displayScore.set(Math.round(target * eased));
      if (progress < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
