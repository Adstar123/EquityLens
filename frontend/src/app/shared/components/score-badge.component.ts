import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-score-badge',
  standalone: true,
  template: `
    <div class="score-badge">
      <span class="score-value">{{ formattedScore() }}</span>
      <span class="rating-pill" [style.background]="ratingBg()" [style.color]="ratingColor()">
        {{ ratingLabel() }}
      </span>
    </div>
  `,
  styles: [`
    .score-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .score-value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      font-size: 1.125rem;
      color: #d4930d;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .rating-pill {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      line-height: 1.2;
      white-space: nowrap;
    }
  `],
})
export class ScoreBadgeComponent {
  score = input.required<number>();
  rating = input.required<string>();

  formattedScore = computed(() => this.score().toFixed(1));

  ratingLabel = computed(() => this.rating().replace(/_/g, ' '));

  ratingColor = computed(() => {
    const map: Record<string, string> = {
      strong_buy: '#22c55e',
      buy: '#84cc16',
      hold: '#d4930d',
      sell: '#ef4444',
      strong_sell: '#dc2626',
    };
    return map[this.rating()] ?? '#8888a0';
  });

  ratingBg = computed(() => {
    const map: Record<string, string> = {
      strong_buy: 'rgba(34, 197, 94, 0.12)',
      buy: 'rgba(132, 204, 22, 0.12)',
      hold: 'rgba(212, 147, 13, 0.12)',
      sell: 'rgba(239, 68, 68, 0.12)',
      strong_sell: 'rgba(220, 38, 38, 0.12)',
    };
    return map[this.rating()] ?? 'rgba(136, 136, 160, 0.12)';
  });
}
