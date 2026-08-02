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
      <ng-icon [svg]="searchIcon" class="search-icon" size="15" />
      <input
        #inputEl
        type="text"
        class="search-input"
        data-ticker-search
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
      left: 11px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
      display: flex;
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 0.85rem;
      padding: 0.5rem 2.2rem 0.5rem 2rem;
      outline: none;
      transition: border-color 160ms ease, box-shadow 160ms ease;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .search-kbd {
      position: absolute;
      right: 9px;
      top: 50%;
      transform: translateY(-50%);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.66rem;
      color: var(--text-muted);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      pointer-events: none;
    }

    .search-input:focus ~ .search-kbd {
      display: none;
    }

    .search-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      z-index: 30;
      max-height: 300px;
      overflow-y: auto;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.55rem 0.75rem;
      cursor: pointer;
    }

    .search-result.highlighted {
      background: var(--bg-surface);
    }

    .sr-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8rem;
      color: var(--text-primary);
      min-width: 70px;
    }

    .sr-name {
      font-size: 0.8rem;
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
          this.results.set(results.slice(0, 8));
          this.highlight.set(0);
        },
        error: () => this.results.set([]),
      });
    }, 250);
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
