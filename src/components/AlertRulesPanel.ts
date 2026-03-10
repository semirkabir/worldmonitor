import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface AlertRule {
  id: string;
  name: string;
  keywords: string[];
  severity: 'all' | 'high' | 'critical';
  region: 'global' | 'mena' | 'europe' | 'asia' | 'americas' | 'africa';
  notifications: boolean;
  active: boolean;
}

export class AlertRulesPanel extends Panel {
  private rules: AlertRule[] = [];
  private static readonly STORAGE_KEY = 'wm-alert-rules';

  constructor() {
    super({ id: 'alert-rules', title: '🔔 Alert Rules Engine' });
    this.loadRules();
    
    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      const addBtn = target.closest('.btn-add-rule');
      if (addBtn) {
        this.addRule();
        return;
      }
      
      const toggleBtn = target.closest('.rule-toggle-btn') as HTMLElement;
      if (toggleBtn?.dataset.id) {
        this.toggleRule(toggleBtn.dataset.id);
        return;
      }
      
      const deleteBtn = target.closest('.rule-delete-btn') as HTMLElement;
      if (deleteBtn?.dataset.id) {
        this.deleteRule(deleteBtn.dataset.id);
        return;
      }
    });

    this.renderPanel();
  }

  private loadRules() {
    try {
      const saved = localStorage.getItem(AlertRulesPanel.STORAGE_KEY);
      if (saved) {
        this.rules = JSON.parse(saved);
      } else {
        // Default sample rules
        this.rules = [
          { id: '1', name: 'Critical Oil Infrastructure', keywords: ['oil', 'refinery', 'pipeline', 'attack', 'strike'], severity: 'high', region: 'mena', notifications: true, active: true },
          { id: '2', name: 'Taiwan Strait Tensions', keywords: ['taiwan strait', 'pla', 'military', 'incursion'], severity: 'all', region: 'asia', notifications: true, active: true },
        ];
        this.saveRules();
      }
    } catch {
      this.rules = [];
    }
  }

  private saveRules() {
    try {
      localStorage.setItem(AlertRulesPanel.STORAGE_KEY, JSON.stringify(this.rules));
    } catch { /* ignore */ }
  }

  private addRule() {
    this.rules.push({
      id: Date.now().toString(),
      name: 'New Custom Rule',
      keywords: ['enter keywords'],
      severity: 'high',
      region: 'global',
      notifications: true,
      active: true
    });
    this.saveRules();
    this.renderPanel();
  }

  private toggleRule(id: string) {
    const rule = this.rules.find(r => r.id === id);
    if (rule) {
      rule.active = !rule.active;
      this.saveRules();
      this.renderPanel();
    }
  }

  private deleteRule(id: string) {
    this.rules = this.rules.filter(r => r.id !== id);
    this.saveRules();
    this.renderPanel();
  }

  private renderPanel(): void {
    if (this.rules.length === 0) {
      this.setContent(`
        <div class="alerts-container">
          <div class="alerts-empty">
            <div class="alerts-empty-icon">🔔</div>
            <div class="alerts-empty-title">No Alert Rules Configured</div>
            <div class="alerts-empty-text">Create rules to receive desktop notifications and highlight critical events on the map based on your specific requirements.</div>
            <button class="btn btn-add-rule">+ Create Alert Rule</button>
          </div>
        </div>
      `);
      return;
    }

    const html = `
      <div class="alerts-container">
        <div class="alerts-header">
          <span class="alerts-count">${this.rules.filter(r => r.active).length} Active Rules</span>
          <button class="btn btn-sm btn-add-rule">+ New Rule</button>
        </div>
        <div class="alerts-list">
          ${this.rules.map(rule => `
            <div class="alert-rule-card ${!rule.active ? 'inactive' : ''}">
              <div class="rule-header">
                <span class="rule-name">${escapeHtml(rule.name)}</span>
                <div class="rule-actions">
                  <button class="rule-action-btn rule-toggle-btn" data-id="${rule.id}" title="Toggle active">
                    ${rule.active ? '🟢' : '⚫'}
                  </button>
                  <button class="rule-action-btn rule-delete-btn" data-id="${rule.id}" title="Delete rule">
                    🗑️
                  </button>
                </div>
              </div>
              <div class="rule-details">
                <div class="rule-detail-row">
                  <span class="rule-label">Keywords:</span>
                  <div class="rule-tags">
                    ${rule.keywords.map(k => `<span class="rule-tag">${escapeHtml(k)}</span>`).join('')}
                  </div>
                </div>
                <div class="rule-detail-row">
                  <span class="rule-label">Severity:</span>
                  <span class="rule-value severity-${rule.severity}">${escapeHtml(rule.severity.toUpperCase())}</span>
                  
                  <span class="rule-label" style="margin-left:12px;">Region:</span>
                  <span class="rule-value">${escapeHtml(rule.region.toUpperCase())}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="alerts-footer">
          <small>Active rules scan incoming telemetry and news dynamically. Turn on browser notifications to get background alerts.</small>
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
