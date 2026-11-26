import { Component, Input, ElementRef, HostListener, signal } from '@angular/core';

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  template: `
    <button
      type="button"
      class="info-icon"
      [class.active]="open()"
      [attr.aria-label]="'About this: ' + description"
      [attr.aria-expanded]="open()"
      (click)="toggle($event)"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      (focus)="onFocus($event)"
      (blur)="open.set(false)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    </button>
    @if (open()) {
      <div class="tooltip-popover" role="tooltip" [style.top.px]="popoverTop" [style.left.px]="popoverLeft">
        {{ description }}
      </div>
    }
  `,
  styles: [`
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      vertical-align: middle;
    }

    .info-icon {
      cursor: help;
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      background: none;
      border: none;
      padding: 0;
      border-radius: 50%;
      transition: color var(--dur-fast) var(--ease);
    }

    .info-icon:hover,
    .info-icon.active {
      color: var(--accent-ink);
    }

    .tooltip-popover {
      position: fixed;
      transform: translateX(-50%);
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      padding: 10px 12px;
      width: 260px;
      z-index: 1000;
      box-shadow: var(--shadow-pop);
      pointer-events: none;
      overflow-wrap: break-word;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.55;
      letter-spacing: 0;
      text-transform: none;
      text-align: left;
      color: var(--text-secondary);
      white-space: normal;
      animation: tipIn var(--dur-fast) var(--ease);
    }

    @keyframes tipIn {
      from { opacity: 0; transform: translate(-50%, -4px); }
    }
  `],
})
export class InfoTooltipComponent {
  @Input() description = '';

  open = signal(false);
  popoverTop = 0;
  popoverLeft = 0;

  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private isTouchDevice = false;

  constructor(private el: ElementRef) {
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private positionPopover(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.popoverTop = rect.bottom + 8;
    this.popoverLeft = rect.left + rect.width / 2;

    // Keep the popover on screen
    const halfWidth = 130;
    if (this.popoverLeft - halfWidth < 8) {
      this.popoverLeft = halfWidth + 8;
    } else if (this.popoverLeft + halfWidth > window.innerWidth - 8) {
      this.popoverLeft = window.innerWidth - halfWidth - 8;
    }
  }

  toggle(event: Event): void {
    // Tooltips often sit inside sortable headers and clickable rows
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.positionPopover();
    this.open.set(true);
  }

  onFocus(event: FocusEvent): void {
    // Keyboard focus only; a mouse click focuses too and is handled by toggle
    if (!(event.target as HTMLElement).matches(':focus-visible')) return;
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
