import { Component, Input, ElementRef, HostListener, signal } from '@angular/core';

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  template: `
    <span
      class="info-icon"
      [class.active]="open()"
      (click)="toggle($event)"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    </span>
    @if (open()) {
      <div class="tooltip-popover" [style.top.px]="popoverTop" [style.left.px]="popoverLeft">
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
      position: fixed;
      transform: translateX(-50%);
      background: var(--surface-elevated, #1e1e2e);
      border: 1px solid var(--border, #2e2e3e);
      border-radius: 8px;
      padding: 8px 12px;
      width: 260px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .tooltip-content {
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--text-secondary, #a0a0b8);
      white-space: normal;
    }
  `],
})
export class InfoTooltipComponent {
  @Input() description = '';

  open = signal(false);
  popoverTop = 0;
  popoverLeft = 0;

  private hoverTimeout: any = null;
  private isTouchDevice = false;

  constructor(private el: ElementRef) {
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private positionPopover(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    // Always show below the icon
    this.popoverTop = rect.bottom + 8;
    this.popoverLeft = rect.left + rect.width / 2;

    // Clamp left so popover doesn't go off-screen
    const halfWidth = 130; // half of 260px
    if (this.popoverLeft - halfWidth < 8) {
      this.popoverLeft = halfWidth + 8;
    } else if (this.popoverLeft + halfWidth > window.innerWidth - 8) {
      this.popoverLeft = window.innerWidth - halfWidth - 8;
    }
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.positionPopover();
    this.open.set(true);
  }

  onMouseEnter(): void {
    if (this.isTouchDevice) return;
    this.hoverTimeout = setTimeout(() => {
      this.positionPopover();
      this.open.set(true);
    }, 150);
  }

  onMouseLeave(): void {
    if (this.isTouchDevice) return;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open() && !this.el.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
