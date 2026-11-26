import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { ApiService, Company } from '../../core/api.service';

// The one search box used everywhere: debounced lookup, arrow-key highlight,
// Enter to open, Escape to dismiss. Focused globally via the "/" shortcut
// (see App), which targets the data-ticker-search attribute.
@Component({
  selector: 'app-ticker-search',
  standalone: true,
  imports: [FormsModule, NgIcon],
  template: `
    <div class="search-wrap">
      <ng-icon [svg]="searchIcon" class="search-icon" size="16" />
      <input
        #inputEl
        type="text"
        class="search-input"
        data-ticker-search
        autocomplete="off"
        [attr.aria-label]="placeholder()"
        [placeholder]="placeholder()"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
      />
      <kbd class="search-kbd" aria-hidden="true">/</kbd>
      @if (results().length > 0) {
        <div class="search-dropdown" role="listbox">
          @for (result of results(); track result.symbol; let i = $index) {
            <div
              class="search-result"
              role="option"
              [class.highlighted]="i === highlight()"
              [attr.aria-selected]="i === highlight()"
              (mousedown)="go(result.symbol)"
              (mouseenter)="highlight.set(i)"
            >
              <span class="sr-symbol">{{ result.symbol }}</span>
              <span class="sr-name">{{ result.name }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .search-wrap {
      position: relative;
      width: 100%;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
      display: flex;
    }

    .search-input {
      width: 100%;
      height: 36px;
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 13px;
      padding: 0 36px 0 36px;
      outline: none;
      transition: border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:hover {
      background: var(--bg-hover);
    }

    .search-input:focus {
      border-color: var(--accent);
      background: var(--bg-surface);
    }

    .search-kbd {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      min-width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
      background: var(--bg-base);
      border: 1px solid var(--border-strong);
      border-bottom-width: 2px;
      border-radius: 4px;
      box-sizing: border-box;
      pointer-events: none;
    }

    .search-input:focus ~ .search-kbd {
      display: none;
    }

    .search-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      padding: 4px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      box-shadow: var(--shadow-pop);
      z-index: 30;
      max-height: 320px;
      overflow-y: auto;
      animation: dropIn var(--dur-fast) var(--ease);
    }

    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-4px); }
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 36px;
      padding: 0 8px;
      border-radius: 8px;
      cursor: pointer;
    }

    .search-result.highlighted {
      background: var(--bg-hover);
    }

    .sr-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 12px;
      color: var(--text-primary);
      min-width: 64px;
    }

    .search-result.highlighted .sr-symbol {
      color: var(--accent-ink);
    }

    .sr-name {
      font-size: 13px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class TickerSearchComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  placeholder = input('Search ticker or company');

  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;

  searchIcon = lucideSearch;
  query = signal('');
  results = signal<Company[]>([]);
  highlight = signal(0);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  focus(): void {
    this.inputEl.nativeElement.focus();
  }

  onQuery(query: string): void {
    this.query.set(query);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (!query) {
      this.results.set([]);
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.api.searchTickers(query).subscribe({
        next: (results) => {
          this.results.set(this.rank(results, query).slice(0, 8));
          this.highlight.set(0);
        },
        error: () => this.results.set([]),
      });
    }, 250);
  }

  // Exact ticker first, then tickers starting with the query, then the rest
  // in the order the API returned them
  private rank(results: Company[], query: string): Company[] {
    const q = query.trim().toUpperCase();
    const score = (c: Company) => {
      const sym = c.symbol.toUpperCase().replace(/\.AX$/, '');
      if (sym === q) return 0;
      if (sym.startsWith(q)) return 1;
      if (c.name.toUpperCase().startsWith(q)) return 2;
      return 3;
    };
    return results
      .map((c, i) => ({ c, i, s: score(c) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map(x => x.c);
  }

  onKeydown(event: KeyboardEvent): void {
    const results = this.results();
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      this.highlight.update(h => (h + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      this.highlight.update(h => (h - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      if (results.length) {
        this.go(results[Math.min(this.highlight(), results.length - 1)].symbol);
      } else {
        const q = this.query().trim().toUpperCase();
        if (q) this.go(q);
      }
    } else if (event.key === 'Escape') {
      this.results.set([]);
      this.inputEl.nativeElement.blur();
    }
  }

  onBlur(): void {
    // Delay so a mousedown on a result still lands
    setTimeout(() => {
      this.query.set('');
      this.results.set([]);
    }, 200);
  }

  go(symbol: string): void {
    this.query.set('');
    this.results.set([]);
    this.router.navigate(['/ticker', symbol]);
  }
}
