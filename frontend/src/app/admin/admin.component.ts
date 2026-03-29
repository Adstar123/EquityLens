import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  SectorWithConfig,
  SectorConfig,
  RatioConfig,
  ConfigVersionRow,
  PreviewResult,
  PreviewScore,
  RangeConfig,
} from '../core/api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  template: `
    <div class="admin-container">
      <header class="admin-header">
        <h1 class="admin-title">CONFIG EDITOR</h1>
        <div class="header-controls">
          <div class="selector-group">
            <label class="field-label">SECTOR</label>
            <select
              class="field-select"
              [ngModel]="selectedSectorKey()"
              (ngModelChange)="onSectorChange($event)"
            >
              <option value="">-- Select sector --</option>
              @for (item of sectorList(); track item.sector.key) {
                <option [value]="item.sector.key">
                  {{ item.sector.display_name }}{{ item.active_config ? ' (v' + item.active_config.version + ')' : ' (no config)' }}
                </option>
              }
            </select>
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-state">Loading...</div>
      } @else if (selectedSectorKey() && configForm) {

        <!-- Tabs -->
        <div class="tab-bar">
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'editor'"
            (click)="activeTab.set('editor')"
          >Editor</button>
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'preview'"
            (click)="activeTab.set('preview')"
          >Preview</button>
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'versions'"
            (click)="activeTab.set('versions'); loadVersions()"
          >Versions</button>
        </div>

        <!-- Editor Tab -->
        @if (activeTab() === 'editor') {
          <div class="editor-content" [formGroup]="configForm">

            <!-- Weight Validation Bar -->
            <div class="weight-bar-section">
              <div class="weight-bar-header">
                <span class="field-label">WEIGHT ALLOCATION</span>
                <span
                  class="weight-sum"
                  [class.valid]="weightValid()"
                  [class.invalid]="!weightValid()"
                >{{ (weightSum() * 100).toFixed(1) }}% / 100%</span>
              </div>
              <div class="weight-bar-track">
                <div
                  class="weight-bar-fill"
                  [style.width.%]="Math.min(weightSum() * 100, 100)"
                  [class.valid]="weightValid()"
                  [class.over]="weightSum() > 1.001"
                  [class.under]="weightSum() < 0.999"
                ></div>
              </div>
              @if (!weightValid()) {
                <div class="weight-warning">
                  @if (weightSum() > 1.001) {
                    Weights exceed 100%. Remove {{ ((weightSum() - 1) * 100).toFixed(1) }}%.
                  } @else {
                    Weights are under 100%. Add {{ ((1 - weightSum()) * 100).toFixed(1) }}% more.
                  }
                </div>
              }
            </div>

            <!-- Ratio Cards -->
            <div class="ratios-section">
              <div class="section-header">
                <span class="section-title">RATIOS</span>
                <button class="btn-add" (click)="addRatio()">+ Add Ratio</button>
              </div>

              <div formArrayName="ratios" class="ratio-cards">
                @for (ratio of ratiosArray.controls; track $index; let i = $index) {
                  <div class="ratio-card" [formGroupName]="$index">
                    <div class="ratio-card-header">
                      <span class="ratio-index">#{{ $index + 1 }}</span>
                      <button
                        class="btn-remove"
                        (click)="removeRatio($index)"
                        title="Remove ratio"
                      >&times;</button>
                    </div>

                    <div class="ratio-fields">
                      <div class="field-row">
                        <div class="field-group flex-2">
                          <label class="field-label">NAME</label>
                          <input type="text" class="field-input" formControlName="name" placeholder="P/E Ratio" />
                        </div>
                        <div class="field-group flex-1">
                          <label class="field-label">KEY</label>
                          <input type="text" class="field-input mono" formControlName="key" placeholder="pe_ratio" />
                        </div>
                        <div class="field-group flex-1">
                          <label class="field-label">WEIGHT</label>
                          <div class="weight-input-wrap">
                            <input
                              type="number"
                              class="field-input mono"
                              formControlName="weight"
                              min="0"
                              max="1"
                              step="0.05"
                            />
                            <span class="weight-pct">{{ ((ratio.get('weight')?.value || 0) * 100).toFixed(0) }}%</span>
                          </div>
                        </div>
                        <div class="field-group flex-shrink">
                          <label class="field-label">LOWER IS BETTER</label>
                          <label class="toggle-switch">
                            <input type="checkbox" formControlName="lower_is_better" />
                            <span class="toggle-slider"></span>
                          </label>
                        </div>
                      </div>

                      <!-- Range Thresholds -->
                      <div class="ranges-section" formGroupName="ranges">
                        <label class="field-label">RANGE THRESHOLDS</label>
                        <div class="ranges-grid">
                          @for (bucket of rangeBuckets; track bucket.key) {
                            <div class="range-group" [formGroupName]="bucket.key">
                              <span class="range-label" [style.color]="bucket.color">{{ bucket.label }}</span>
                              <div class="range-inputs">
                                <input
                                  type="number"
                                  class="field-input-sm mono"
                                  formControlName="min"
                                  placeholder="min"
                                  step="any"
                                />
                                <span class="range-sep">-</span>
                                <input
                                  type="number"
                                  class="field-input-sm mono"
                                  formControlName="max"
                                  placeholder="max"
                                  step="any"
                                />
                              </div>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Edge Cases -->
            <div class="section-block" formGroupName="edge_cases">
              <span class="section-title">EDGE CASES</span>
              <div class="field-row mt-8">
                <div class="field-group flex-2">
                  <label class="field-label">NEGATIVE EARNINGS RULE</label>
                  <select class="field-select" formControlName="negative_earnings">
                    <option value="exclude_pe_redistribute">Exclude P/E, Redistribute</option>
                    <option value="exclude_pe_skip">Exclude P/E, Skip</option>
                    <option value="score_as_poor">Score as Poor</option>
                    <option value="ignore">Ignore</option>
                  </select>
                </div>
                <div class="field-group flex-1">
                  <label class="field-label">MISSING DATA THRESHOLD</label>
                  <input
                    type="number"
                    class="field-input mono"
                    formControlName="missing_data_threshold"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
              </div>
            </div>

            <!-- Rating Scale -->
            <div class="section-block" formGroupName="rating_scale">
              <span class="section-title">RATING SCALE</span>
              <div class="rating-grid mt-8">
                @for (rating of ratingLevels; track rating.key) {
                  <div class="rating-row" [formGroupName]="rating.key">
                    <span class="rating-label" [style.color]="rating.color">{{ rating.label }}</span>
                    <div class="range-inputs">
                      <input
                        type="number"
                        class="field-input-sm mono"
                        formControlName="min"
                        placeholder="min"
                        step="any"
                      />
                      <span class="range-sep">-</span>
                      <input
                        type="number"
                        class="field-input-sm mono"
                        formControlName="max"
                        placeholder="max"
                        step="any"
                      />
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Actions -->
            <div class="actions-bar">
              <button
                class="btn-save"
                [disabled]="!weightValid() || saving()"
                (click)="saveConfig()"
              >
                @if (saving()) {
                  Saving...
                } @else {
                  Save Draft
                }
              </button>
              <button
                class="btn-preview"
                [disabled]="!weightValid() || previewing()"
                (click)="runPreview()"
              >
                @if (previewing()) {
                  Loading...
                } @else {
                  Preview Scores
                }
              </button>
              <button
                class="btn-publish"
                [disabled]="publishing() || !hasDraft()"
                (click)="confirmPublish()"
              >
                @if (publishing()) {
                  Publishing...
                } @else {
                  Publish
                }
              </button>
            </div>

            @if (saveMsg()) {
              <div class="msg" [class.success]="saveMsgType() === 'success'" [class.error]="saveMsgType() === 'error'">
                {{ saveMsg() }}
              </div>
            }
          </div>
        }

        <!-- Preview Tab -->
        @if (activeTab() === 'preview') {
          <div class="preview-content">
            @if (!previewData()) {
              <div class="preview-empty">
                Click "Preview Scores" in the editor to see a side-by-side comparison.
              </div>
            } @else {
              <div class="preview-table-wrap">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th>Current Score</th>
                      <th>Current Rating</th>
                      <th>Preview Score</th>
                      <th>Preview Rating</th>
                      <th>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of previewRows(); track row.symbol) {
                      <tr>
                        <td class="cell-mono">{{ row.symbol }}</td>
                        <td>{{ row.company_name }}</td>
                        <td class="cell-mono">{{ row.currentScore.toFixed(1) }}</td>
                        <td>
                          <span class="rating-pill-sm" [style.color]="ratingColor(row.currentRating)">
                            {{ ratingDisplayLabel(row.currentRating) }}
                          </span>
                        </td>
                        <td class="cell-mono">{{ row.previewScore.toFixed(1) }}</td>
                        <td>
                          <span class="rating-pill-sm" [style.color]="ratingColor(row.previewRating)">
                            {{ ratingDisplayLabel(row.previewRating) }}
                          </span>
                        </td>
                        <td
                          class="cell-mono"
                          [class.delta-pos]="row.delta > 0"
                          [class.delta-neg]="row.delta < 0"
                        >{{ row.delta > 0 ? '+' : '' }}{{ row.delta.toFixed(1) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- Versions Tab -->
        @if (activeTab() === 'versions') {
          <div class="versions-content">
            @if (versionsLoading()) {
              <div class="loading-state">Loading versions...</div>
            } @else {
              <table class="versions-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Published</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (ver of versions(); track ver.id) {
                    <tr [class.active-version]="ver.is_active">
                      <td class="cell-mono">v{{ ver.version }}</td>
                      <td>
                        @if (ver.is_active) {
                          <span class="status-active">ACTIVE</span>
                        } @else if (ver.published_at) {
                          <span class="status-published">PUBLISHED</span>
                        } @else {
                          <span class="status-draft">DRAFT</span>
                        }
                      </td>
                      <td class="cell-dim">{{ ver.published_at ? formatDate(ver.published_at) : '--' }}</td>
                      <td class="cell-dim">{{ formatDate(ver.created_at) }}</td>
                      <td>
                        @if (!ver.is_active) {
                          <button class="btn-restore" (click)="restoreVersion(ver)">Restore</button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="empty-state">No versions found.</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

      } @else if (!selectedSectorKey()) {
        <div class="empty-state-full">
          Select a sector to edit its scoring configuration.
        </div>
      }

      <!-- Publish Confirm Dialog -->
      @if (showConfirmDialog()) {
        <div class="dialog-backdrop" (click)="showConfirmDialog.set(false)">
          <div class="dialog-box" (click)="$event.stopPropagation()">
            <div class="dialog-title">Publish Config</div>
            <p class="dialog-msg">This will re-score all companies in this sector. Continue?</p>
            <div class="dialog-actions">
              <button class="btn-cancel" (click)="showConfirmDialog.set(false)">Cancel</button>
              <button class="btn-confirm" (click)="doPublish()">Publish</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  Math = Math;

  sectorList = signal<SectorWithConfig[]>([]);
  selectedSectorKey = signal('');
  loading = signal(false);
  saving = signal(false);
  previewing = signal(false);
  publishing = signal(false);
  activeTab = signal<'editor' | 'preview' | 'versions'>('editor');
  saveMsg = signal('');
  saveMsgType = signal<'success' | 'error'>('success');
  showConfirmDialog = signal(false);
  hasDraft = signal(false);

  // Preview
  previewData = signal<PreviewResult | null>(null);
  previewRows = computed(() => {
    const data = this.previewData();
    if (!data) return [];
    return data.current.map((cur, i) => {
      const prev = data.preview[i] || cur;
      return {
        symbol: cur.symbol,
        company_name: cur.company_name,
        currentScore: cur.composite_score,
        currentRating: cur.rating,
        previewScore: prev.composite_score,
        previewRating: prev.rating,
        delta: prev.composite_score - cur.composite_score,
      };
    });
  });

  // Versions
  versions = signal<ConfigVersionRow[]>([]);
  versionsLoading = signal(false);

  // Form
  configForm!: FormGroup;

  // Weight tracking
  weightSum = signal(0);
  weightValid = computed(() => Math.abs(this.weightSum() - 1.0) <= 0.001);

  readonly rangeBuckets = [
    { key: 'strong', label: 'Strong', color: '#22c55e' },
    { key: 'good', label: 'Good', color: '#84cc16' },
    { key: 'neutral', label: 'Neutral', color: '#d4930d' },
    { key: 'weak', label: 'Weak', color: '#f97316' },
    { key: 'poor', label: 'Poor', color: '#ef4444' },
  ];

  readonly ratingLevels = [
    { key: 'strong_buy', label: 'Very Strong', color: '#22c55e' },
    { key: 'buy', label: 'Strong', color: '#84cc16' },
    { key: 'hold', label: 'Neutral', color: '#d4930d' },
    { key: 'sell', label: 'Weak', color: '#f97316' },
    { key: 'strong_sell', label: 'Very Weak', color: '#ef4444' },
  ];

  get ratiosArray(): FormArray {
    return this.configForm.get('ratios') as FormArray;
  }

  ngOnInit(): void {
    this.loadSectors();
  }

  private loadSectors(): void {
    this.api.getConfigs().subscribe({
      next: (data) => this.sectorList.set(data),
      error: () => this.sectorList.set([]),
    });
  }

  onSectorChange(key: string): void {
    this.selectedSectorKey.set(key);
    this.previewData.set(null);
    this.saveMsg.set('');
    this.activeTab.set('editor');
    if (key) {
      this.loadConfig(key);
    }
  }

  private loadConfig(sectorKey: string): void {
    this.loading.set(true);
    this.api.getConfig(sectorKey).subscribe({
      next: (row) => {
        this.buildForm(row.config_json);
        this.hasDraft.set(false);
        this.loading.set(false);
      },
      error: () => {
        // No config yet -- build an empty form
        const sectorItem = this.sectorList().find(s => s.sector.key === sectorKey);
        this.buildForm({
          sector: sectorKey,
          display_name: sectorItem?.sector.display_name ?? sectorKey,
          ratios: [],
          edge_cases: { negative_earnings: 'exclude_pe_redistribute', missing_data_threshold: 0.4 },
          rating_scale: {
            strong_buy: { min: 80 },
            buy: { min: 65, max: 80 },
            hold: { min: 45, max: 65 },
            sell: { min: 30, max: 45 },
            strong_sell: { max: 30 },
          },
        });
        this.hasDraft.set(false);
        this.loading.set(false);
      },
    });
  }

  private buildForm(config: SectorConfig): void {
    this.configForm = this.fb.group({
      sector: [config.sector],
      display_name: [config.display_name, Validators.required],
      ratios: this.fb.array(
        config.ratios.map(r => this.buildRatioGroup(r))
      ),
      edge_cases: this.fb.group({
        negative_earnings: [config.edge_cases?.negative_earnings ?? 'exclude_pe_redistribute'],
        missing_data_threshold: [config.edge_cases?.missing_data_threshold ?? 0.4],
      }),
      rating_scale: this.fb.group({
        strong_buy: this.fb.group({ min: [config.rating_scale?.strong_buy?.min ?? null], max: [config.rating_scale?.strong_buy?.max ?? null] }),
        buy: this.fb.group({ min: [config.rating_scale?.buy?.min ?? null], max: [config.rating_scale?.buy?.max ?? null] }),
        hold: this.fb.group({ min: [config.rating_scale?.hold?.min ?? null], max: [config.rating_scale?.hold?.max ?? null] }),
        sell: this.fb.group({ min: [config.rating_scale?.sell?.min ?? null], max: [config.rating_scale?.sell?.max ?? null] }),
        strong_sell: this.fb.group({ min: [config.rating_scale?.strong_sell?.min ?? null], max: [config.rating_scale?.strong_sell?.max ?? null] }),
      }),
    });

    this.recalcWeights();

    // Subscribe to weight changes
    this.ratiosArray.valueChanges.subscribe(() => {
      this.recalcWeights();
    });
  }

  private buildRatioGroup(r: RatioConfig): FormGroup {
    return this.fb.group({
      key: [r.key, Validators.required],
      name: [r.name, Validators.required],
      weight: [r.weight, [Validators.required, Validators.min(0), Validators.max(1)]],
      lower_is_better: [r.lower_is_better],
      ranges: this.fb.group({
        strong: this.fb.group({ min: [r.ranges?.strong?.min ?? null], max: [r.ranges?.strong?.max ?? null] }),
        good: this.fb.group({ min: [r.ranges?.good?.min ?? null], max: [r.ranges?.good?.max ?? null] }),
        neutral: this.fb.group({ min: [r.ranges?.neutral?.min ?? null], max: [r.ranges?.neutral?.max ?? null] }),
        weak: this.fb.group({ min: [r.ranges?.weak?.min ?? null], max: [r.ranges?.weak?.max ?? null] }),
        poor: this.fb.group({ min: [r.ranges?.poor?.min ?? null], max: [r.ranges?.poor?.max ?? null] }),
      }),
    });
  }

  private recalcWeights(): void {
    const ratios = this.ratiosArray.value as Array<{ weight: number }>;
    const sum = ratios.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    this.weightSum.set(sum);
  }

  addRatio(): void {
    this.ratiosArray.push(this.buildRatioGroup({
      key: '',
      name: '',
      weight: 0,
      lower_is_better: false,
      ranges: {
        strong: { min: null, max: null },
        good: { min: null, max: null },
        neutral: { min: null, max: null },
        weak: { min: null, max: null },
        poor: { min: null, max: null },
      },
    }));
  }

  removeRatio(index: number): void {
    this.ratiosArray.removeAt(index);
  }

  private getFormConfig(): SectorConfig {
    const raw = this.configForm.getRawValue();
    // Clean up null range values to match the backend's omitempty behavior
    const cleanRange = (r: RangeConfig): RangeConfig => {
      const result: RangeConfig = {};
      if (r.min != null) result.min = Number(r.min);
      if (r.max != null) result.max = Number(r.max);
      return result;
    };

    return {
      sector: raw.sector,
      display_name: raw.display_name,
      ratios: raw.ratios.map((r: any) => ({
        key: r.key,
        name: r.name,
        weight: Number(r.weight),
        lower_is_better: !!r.lower_is_better,
        ranges: {
          strong: cleanRange(r.ranges.strong),
          good: cleanRange(r.ranges.good),
          neutral: cleanRange(r.ranges.neutral),
          weak: cleanRange(r.ranges.weak),
          poor: cleanRange(r.ranges.poor),
        },
      })),
      edge_cases: {
        negative_earnings: raw.edge_cases.negative_earnings,
        missing_data_threshold: Number(raw.edge_cases.missing_data_threshold),
      },
      rating_scale: {
        strong_buy: cleanRange(raw.rating_scale.strong_buy),
        buy: cleanRange(raw.rating_scale.buy),
        hold: cleanRange(raw.rating_scale.hold),
        sell: cleanRange(raw.rating_scale.sell),
        strong_sell: cleanRange(raw.rating_scale.strong_sell),
      },
    };
  }

  saveConfig(): void {
    if (!this.weightValid()) return;
    const sector = this.selectedSectorKey();
    if (!sector) return;

    this.saving.set(true);
    this.saveMsg.set('');

    const config = this.getFormConfig();
    this.api.updateConfig(sector, config).subscribe({
      next: () => {
        this.saving.set(false);
        this.hasDraft.set(true);
        this.saveMsg.set('Draft saved successfully.');
        this.saveMsgType.set('success');
        this.clearMsgAfterDelay();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveMsg.set('Failed to save: ' + (err?.error?.error || 'unknown error'));
        this.saveMsgType.set('error');
      },
    });
  }

  runPreview(): void {
    if (!this.weightValid()) return;
    const sector = this.selectedSectorKey();
    if (!sector) return;

    this.previewing.set(true);
    const config = this.getFormConfig();
    this.api.previewConfig(sector, config).subscribe({
      next: (data) => {
        this.previewData.set(data);
        this.previewing.set(false);
        this.activeTab.set('preview');
      },
      error: () => {
        this.previewing.set(false);
        this.saveMsg.set('Preview failed. Make sure companies are scored.');
        this.saveMsgType.set('error');
      },
    });
  }

  confirmPublish(): void {
    this.showConfirmDialog.set(true);
  }

  doPublish(): void {
    this.showConfirmDialog.set(false);
    const sector = this.selectedSectorKey();
    if (!sector) return;

    this.publishing.set(true);
    this.api.publishConfig(sector).subscribe({
      next: () => {
        this.publishing.set(false);
        this.hasDraft.set(false);
        this.saveMsg.set('Config published. Re-scoring in progress.');
        this.saveMsgType.set('success');
        this.clearMsgAfterDelay();
        this.loadSectors(); // refresh sector list
      },
      error: (err) => {
        this.publishing.set(false);
        this.saveMsg.set('Publish failed: ' + (err?.error?.error || 'unknown error'));
        this.saveMsgType.set('error');
      },
    });
  }

  loadVersions(): void {
    const sector = this.selectedSectorKey();
    if (!sector) return;

    this.versionsLoading.set(true);
    this.api.getConfigVersions(sector).subscribe({
      next: (v) => {
        this.versions.set(v || []);
        this.versionsLoading.set(false);
      },
      error: () => {
        this.versions.set([]);
        this.versionsLoading.set(false);
      },
    });
  }

  restoreVersion(ver: ConfigVersionRow): void {
    this.buildForm(ver.config_json);
    this.activeTab.set('editor');
    this.saveMsg.set(`Restored v${ver.version} into editor. Save to create a new draft.`);
    this.saveMsgType.set('success');
    this.clearMsgAfterDelay();
  }

  ratingDisplayLabel(rating: string): string {
    const labels: Record<string, string> = {
      strong_buy: 'Very Strong', buy: 'Strong', hold: 'Neutral',
      sell: 'Weak', strong_sell: 'Very Weak', insufficient_data: 'No Data',
    };
    return labels[rating] ?? rating.replace(/_/g, ' ');
  }

  ratingColor(rating: string): string {
    const map: Record<string, string> = {
      strong_buy: '#22c55e',
      buy: '#84cc16',
      hold: '#d4930d',
      sell: '#f97316',
      strong_sell: '#ef4444',
    };
    return map[rating] ?? '#8888a0';
  }

  formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  private clearMsgAfterDelay(): void {
    setTimeout(() => this.saveMsg.set(''), 5000);
  }
}
