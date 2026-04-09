export type InsightSeverityPreference = 'conservative' | 'balanced' | 'aggressive';

const STORAGE_KEY = 'wm-insight-severity-preference';
const EVENT_NAME = 'insight-severity-preference-changed';

export const INSIGHT_SEVERITY_OPTIONS: Array<{
  value: InsightSeverityPreference;
  label: string;
  description: string;
}> = [
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Reserve strong highlights for highly confirmed, high-impact stories.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Default mix of signal quality, urgency, and confirmed importance.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Surface emerging stories earlier, even with less confirmation.',
  },
];

export function getInsightSeverityPreference(): InsightSeverityPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'conservative' || raw === 'balanced' || raw === 'aggressive') return raw;
  } catch {
    // Ignore storage access issues and fall through to default.
  }
  return 'balanced';
}

export function setInsightSeverityPreference(value: InsightSeverityPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { value } }));
}

export function subscribeInsightSeverityPreferenceChange(
  cb: (value: InsightSeverityPreference) => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as { value?: InsightSeverityPreference } | undefined;
    cb(detail?.value ?? getInsightSeverityPreference());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
