import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-ratio-bar',
  standalone: true,
  template: `
    <div class="ratio-bar-container">
      <div class="ratio-bar-track">
        <div
          class="ratio-bar-fill"
          [style.width.%]="fillPercent()"
          [style.background]="fillColor()"
        ></div>
      </div>
    </div>
  `,
  styles: [`
    .ratio-bar-container {
      display: inline-block;
      width: 60px;
    }

    .ratio-bar-track {
      width: 100%;
      height: 4px;
      background: #1a1a2e;
      overflow: hidden;
    }

    .ratio-bar-fill {
      height: 100%;
      transition: width 300ms ease;
    }
  `],
})
export class RatioBarComponent {
  value = input.required<number>();
  rangeBucket = input.required<string>();

  fillPercent = computed(() => {
    const map: Record<string, number> = {
      strong: 100,
      good: 80,
      neutral: 60,
      weak: 40,
      poor: 20,
    };
    return map[this.rangeBucket()] ?? 50;
  });

  fillColor = computed(() => {
    const map: Record<string, string> = {
      strong: '#22c55e',
      good: '#84cc16',
      neutral: '#d4930d',
      weak: '#f97316',
      poor: '#ef4444',
    };
    return map[this.rangeBucket()] ?? '#555570';
  });
}
