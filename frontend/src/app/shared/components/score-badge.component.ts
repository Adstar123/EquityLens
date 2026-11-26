import { Component, input, computed } from '@angular/core';
import { BandMeterComponent } from './band-meter.component';
import { ratingBand, ratingLabel } from '../../core/bands';

// Score as a figure, its band meter, and optionally the rating in words
@Component({
  selector: 'app-score-badge',
  standalone: true,
  imports: [BandMeterComponent],
  template: `
    <span class="score-badge" [class.is-unscored]="!band()">
      <span class="score-value">{{ formattedScore() }}</span>
      <app-band-meter [band]="band()" />
      @if (showLabel()) {
        <span class="score-label" [class.is-strong]="band() === 'strong' || band() === 'good'">{{ label() }}</span>
      }
    </span>
  `,
  styles: [`
    .score-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .score-value {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      font-size: 14px;
      color: var(--text-primary);
      min-width: 3ch;
      text-align: right;
      line-height: 1;
    }

    .score-label {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .score-label.is-strong {
      color: var(--text-secondary);
    }

    .is-unscored .score-value {
      color: var(--text-muted);
    }
  `],
})
export class ScoreBadgeComponent {
  score = input.required<number>();
  rating = input.required<string>();
  showLabel = input(false);

  // Whole numbers only; a decimal place implies precision the model doesn't have
  formattedScore = computed(() => Math.round(this.score()).toString());
  band = computed(() => ratingBand(this.rating()));
  label = computed(() => ratingLabel(this.rating()));
}
