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
      color: var(--accent);
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .rating-pill {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border-radius: 999px;
      line-height: 1.2;
      white-space: nowrap;
    }
  `],
})
export class ScoreBadgeComponent {
  score = input.required<number>();
  rating = input.required<string>();

  formattedScore = computed(() => this.score().toFixed(1));

  ratingLabel = computed(() => {
    const labels: Record<string, string> = {
      strong_buy: 'Very Strong', buy: 'Strong', hold: 'Neutral',
      sell: 'Weak', strong_sell: 'Very Weak', insufficient_data: 'No Data',
    };
    return labels[this.rating()] ?? this.rating().replace(/_/g, ' ');
  });

  ratingColor = computed(() => {
    const map: Record<string, string> = {
      strong_buy: '#2ebd70',
      buy: '#8fc63d',
      hold: '#e2a428',
      sell: '#e5484d',
      strong_sell: '#d03136',
    };
    return map[this.rating()] ?? '#93a1af';
  });

  ratingBg = computed(() => {
    const map: Record<string, string> = {
      strong_buy: 'rgba(46, 189, 112, 0.12)',
      buy: 'rgba(143, 198, 61, 0.12)',
      hold: 'rgba(226, 164, 40, 0.12)',
      sell: 'rgba(229, 72, 77, 0.12)',
      strong_sell: 'rgba(208, 49, 54, 0.12)',
    };
    return map[this.rating()] ?? 'rgba(147, 161, 175, 0.12)';
  });
}
