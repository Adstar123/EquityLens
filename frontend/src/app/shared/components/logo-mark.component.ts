import { Component, input } from '@angular/core';

// The EquityLens mark: a magnifying lens over a rising chart line.
// Mirrors public/favicon.svg so the tab icon and in-app logo match.
@Component({
  selector: 'app-logo-mark',
  standalone: true,
  template: `
    <svg [style.width.px]="size()" [style.height.px]="size()" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="26" cy="26" r="18" fill="none" stroke="#e2a428" stroke-width="4"/>
      <line x1="39" y1="39" x2="56" y2="56" stroke="#e2a428" stroke-width="5" stroke-linecap="round"/>
      <polyline points="14,34 20,28 26,31 32,18" fill="none" stroke="#f2c14e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="27,18 32,18 32,23" fill="none" stroke="#f2c14e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }
  `],
})
export class LogoMarkComponent {
  size = input(22);
}
