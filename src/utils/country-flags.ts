import { nameToCountryCode, iso3ToIso2Code } from '@/services/country-geometry';

/**
 * Convert an ISO2 country code to a flag emoji using Unicode regional indicator symbols.
 * E.g. 'US' → 🇺🇸, 'GB' → 🇬🇧
 */
function iso2ToFlag(iso2: string): string {
  const upper = iso2.toUpperCase();
  if (upper.length !== 2) return '🌐';
  return String.fromCodePoint(
    upper.charCodeAt(0) + 0x1F1A5,
    upper.charCodeAt(1) + 0x1F1A5,
  );
}

/**
 * Resolve a country identifier to its flag emoji.
 * Accepts ISO2 codes ('US'), ISO3 codes ('USA'), or country names ('United States').
 * Returns '🌐' for unrecognised inputs.
 */
export function getCountryFlag(key: string): string {
  if (!key) return '🌐';
  const trimmed = key.trim();

  // Special tokens
  if (trimmed === 'International' || trimmed === 'UNKNOWN') return '🌐';

  // 2-letter: treat as ISO2 directly
  if (trimmed.length === 2) return iso2ToFlag(trimmed);

  // 3-letter: try ISO3 → ISO2
  if (trimmed.length === 3) {
    const iso2 = iso3ToIso2Code(trimmed);
    if (iso2) return iso2ToFlag(iso2);
  }

  // Try country name → ISO2
  const fromName = nameToCountryCode(trimmed);
  if (fromName) return iso2ToFlag(fromName);

  return '🌐';
}
