import { Component, Input, ElementRef, HostListener, signal } from '@angular/core';

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  template: `
    <span class="info-icon" (click)="toggle($event)" [class.active]="open()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    </span>
    @if (open()) {
      <div class="tooltip-popover" [class.flip]="flipBelow">
        <div class="tooltip-content">{{ description }}</div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
    }
    .info-icon {
      cursor: pointer;
      color: var(--text-tertiary, #6b7280);
      display: inline-flex;
      align-items: center;
      transition: color 0.15s ease;
    }
    .info-icon:hover, .info-icon.active {
      color: var(--accent, #6366f1);
    }
    .tooltip-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface-elevated, #1e1e2e);
      border: 1px solid var(--border, #2e2e3e);
      border-radius: 8px;
      padding: 8px 12px;
      min-width: 200px;
      max-width: 300px;
      z-index: 50;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .tooltip-popover::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: var(--border, #2e2e3e);
    }
    .tooltip-popover.flip {
      bottom: auto;
      top: calc(100% + 8px);
    }
    .tooltip-popover.flip::after {
      top: auto;
      bottom: 100%;
      border-top-color: transparent;
      border-bottom-color: var(--border, #2e2e3e);
    }
    .tooltip-content {
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--text-secondary, #a0a0b8);
    }
  `],
})
export class InfoTooltipComponent {
  @Input() description = '';

  open = signal(false);
  flipBelow = false;

  constructor(private el: ElementRef) {}

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.flipBelow = rect.top < 120;
    this.open.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open() && !this.el.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
