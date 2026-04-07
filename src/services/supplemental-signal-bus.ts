import type { TemporalAnomaly } from './temporal-baseline';

/**
 * SupplementalSignalBus
 *
 * A generic signal channel that lets any new data source plug into the
 * AI assessment, CII scoring, anomaly detection, and alerting pipelines
 * with a single emit() call.
 */

export interface SupplementalSignal {
  sourceId: string;
  sourceName: string;
  country: string;
  value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  timestamp: Date;
  lat?: number;
  lon?: number;
  tags?: string[];
}

export interface SupplementalAnomaly {
  sourceId: string;
  sourceName: string;
  zScore: number;
  currentCount: number;
  expectedCount: number;
  severity: 'medium' | 'high' | 'critical';
  message: string;
}

type EmitListener = (sourceId: string, signals: SupplementalSignal[]) => void;

const SEVERITY_WEIGHT: Record<SupplementalSignal['severity'], number> = {
  low: 0,
  medium: 0.5,
  high: 2,
  critical: 4,
};

const SEVERITY_RANK: Record<SupplementalSignal['severity'], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

class SupplementalSignalBus {
  private store = new Map<string, SupplementalSignal[]>();
  private history = new Map<string, Array<{ ts: number; count: number }>>();
  private anomalies = new Map<string, SupplementalAnomaly>();
  private baselines = new Map<string, { mean: number; stdDev: number; sourceName: string }>();
  private listeners: EmitListener[] = [];

  emit(sourceId: string, signals: SupplementalSignal[]): void {
    this.store.set(sourceId, signals);
    this.recordHistory(sourceId, signals.length);
    void this.syncTemporalAnomaly(sourceId);
    this.listeners.forEach(fn => fn(sourceId, signals));

    if (signals.some(s => s.severity === 'high' || s.severity === 'critical') && typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('wm:intelligence-updated'));
    }
  }

  registerBaseline(sourceId: string, mean: number, stdDev: number, sourceName?: string): void {
    this.baselines.set(sourceId, {
      mean,
      stdDev,
      sourceName: sourceName || this.getSourceName(sourceId) || sourceId,
    });
  }

  getCountrySignals(code: string): SupplementalSignal[] {
    const result: SupplementalSignal[] = [];
    for (const signals of this.store.values()) {
      for (const signal of signals) {
        if (signal.country === code) result.push(signal);
      }
    }
    return result;
  }

  getCountryAlerts(code: string): SupplementalSignal[] {
    return this.getCountrySignals(code)
      .filter(signal => signal.severity === 'high' || signal.severity === 'critical')
      .sort((a, b) => {
        const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }

  getCountryCIIBoost(code: string): number {
    let boost = 0;
    for (const signals of this.store.values()) {
      for (const signal of signals) {
        if (signal.country === code) {
          boost += SEVERITY_WEIGHT[signal.severity];
        }
      }
    }
    return Math.min(20, boost);
  }

  getAIContext(code: string): string {
    const parts: string[] = [];

    for (const [sourceId, signals] of this.store) {
      const countrySignals = signals
        .filter(signal => signal.country === code && signal.severity !== 'low')
        .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

      if (countrySignals.length === 0) continue;
      parts.push(`${sourceId}=${countrySignals[0]!.label}`);
    }

    return parts.join(', ');
  }

  getAnomalies(): SupplementalAnomaly[] {
    return [...this.anomalies.values()].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  }

  getTemporalAnomalies(): TemporalAnomaly[] {
    return this.getAnomalies().map(anomaly => this.toTemporalAnomaly(anomaly));
  }

  getAllAlerts(): SupplementalSignal[] {
    const alerts: SupplementalSignal[] = [];
    for (const signals of this.store.values()) {
      alerts.push(...signals.filter(signal => signal.severity === 'high' || signal.severity === 'critical'));
    }
    return alerts.sort((a, b) => {
      const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }

  onEmit(listener: EmitListener): void {
    this.listeners.push(listener);
  }

  clear(sourceId: string): void {
    this.store.delete(sourceId);
    this.anomalies.delete(sourceId);
    void this.syncTemporalPipeline(sourceId, null);
  }

  private recordHistory(sourceId: string, count: number): void {
    const entries = this.history.get(sourceId) ?? [];
    entries.push({ ts: Date.now(), count });
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.history.set(sourceId, entries.filter(entry => entry.ts > cutoff));
  }

  private buildAnomaly(sourceId: string): SupplementalAnomaly | null {
    const now = Date.now();
    const entries = (this.history.get(sourceId) ?? []).filter(entry => now - entry.ts < WINDOW_MS);
    if (entries.length < 3) return null;

    const counts = entries.map(entry => entry.count);
    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    const registered = this.baselines.get(sourceId);
    const effectiveMean = registered?.mean ?? mean;
    const effectiveStdDev = registered?.stdDev ?? stdDev;
    if (effectiveStdDev < 0.1) return null;

    const currentCount = entries[entries.length - 1]!.count;
    const zScore = (currentCount - effectiveMean) / effectiveStdDev;
    if (Math.abs(zScore) < 2.0) return null;

    const sourceName = this.getSourceName(sourceId) ?? sourceId;
    const multiplier = effectiveMean > 0 ? currentCount / effectiveMean : 1;

    return {
      sourceId,
      sourceName,
      zScore,
      currentCount,
      expectedCount: Math.round(effectiveMean),
      severity: Math.abs(zScore) >= 3.0 ? 'critical' : 'high',
      message: `${sourceName} ${multiplier.toFixed(1)}x normal - ${currentCount} vs baseline ${Math.round(effectiveMean)}`,
    };
  }

  private toTemporalAnomaly(anomaly: SupplementalAnomaly): TemporalAnomaly {
    return {
      type: anomaly.sourceId,
      region: 'global',
      currentCount: anomaly.currentCount,
      expectedCount: anomaly.expectedCount,
      zScore: anomaly.zScore,
      message: anomaly.message,
      severity: anomaly.severity,
    };
  }

  private getSourceName(sourceId: string): string | undefined {
    const registered = this.baselines.get(sourceId);
    if (registered) return registered.sourceName;

    const signals = this.store.get(sourceId);
    return signals?.[0]?.sourceName;
  }

  private async syncTemporalAnomaly(sourceId: string): Promise<void> {
    const anomaly = this.buildAnomaly(sourceId);
    if (anomaly) this.anomalies.set(sourceId, anomaly);
    else this.anomalies.delete(sourceId);

    await this.syncTemporalPipeline(sourceId, anomaly);
  }

  private async syncTemporalPipeline(sourceId: string, anomaly: SupplementalAnomaly | null): Promise<void> {
    try {
      const temporalAnomalies = anomaly ? [this.toTemporalAnomaly(anomaly)] : [];
      const [{ signalAggregator }, { ingestTemporalAnomaliesForCII }] = await Promise.all([
        import('./signal-aggregator'),
        import('./country-instability'),
      ]);

      signalAggregator.ingestTemporalAnomalies(temporalAnomalies, [sourceId]);
      ingestTemporalAnomaliesForCII(temporalAnomalies, [sourceId]);
    } catch (error) {
      console.warn('[SupplementalSignalBus] Failed to sync temporal anomaly pipeline:', error);
    }
  }
}

export const supplementalBus = new SupplementalSignalBus();
