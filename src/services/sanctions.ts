export interface SanctionEntity {
  id: string;
  name: string;
  type: 'person' | 'company' | 'vessel' | 'aircraft' | 'other';
  countries: string[];
  programs: string[];
  dateAdded: string;
  source: string;
  aliases?: string[];
}

const now = new Date();
const daysAgo = (days: number): string => {
  const copy = new Date(now);
  copy.setDate(copy.getDate() - days);
  return copy.toISOString();
};

const FALLBACK_SANCTIONS: SanctionEntity[] = [
  { id: 'ofac-sovcomflot-ns-century', name: 'Sovcomflot Vessel NS Century', type: 'vessel', countries: ['RU'], programs: ['OFAC SDN', 'Ukraine-Related'], dateAdded: daysAgo(1), source: 'OFAC', aliases: ['NS Century'] },
  { id: 'ofac-arctic-lng-2', name: 'Arctic LNG 2 LLC', type: 'company', countries: ['RU'], programs: ['EU Consolidated List', 'OFAC'], dateAdded: daysAgo(2), source: 'EU/OFAC' },
  { id: 'un-kim-jong-un', name: 'Kim Jong Un', type: 'person', countries: ['KP'], programs: ['UN Security Council', 'OFAC'], dateAdded: daysAgo(5), source: 'UN' },
  { id: 'eu-iran-air', name: 'Iran Air', type: 'company', countries: ['IR'], programs: ['EU Sanctions Map', 'OFAC'], dateAdded: daysAgo(8), source: 'EU' },
  { id: 'ofac-mahan-air', name: 'Mahan Air Flight QFZ995', type: 'aircraft', countries: ['IR'], programs: ['OFAC'], dateAdded: daysAgo(10), source: 'OFAC', aliases: ['Mahan Air'] },
  { id: 'bis-huawei', name: 'Huawei Technologies Co., Ltd.', type: 'company', countries: ['CN'], programs: ['BIS Entity List'], dateAdded: daysAgo(15), source: 'BIS', aliases: ['Huawei'] },
  { id: 'ofac-pdvsa', name: 'PDVSA', type: 'company', countries: ['VE'], programs: ['OFAC SDN'], dateAdded: daysAgo(20), source: 'OFAC' },
  { id: 'un-al-shabaab-network', name: 'Al-Shabaab Financial Network', type: 'company', countries: ['SO'], programs: ['UN Security Council'], dateAdded: daysAgo(22), source: 'UN' },
  { id: 'ofac-mehpl', name: 'Myanmar Economic Holdings Public Company Limited', type: 'company', countries: ['MM'], programs: ['UK Sanctions List', 'OFAC'], dateAdded: daysAgo(25), source: 'UK/OFAC', aliases: ['MEHL'] },
  { id: 'ofac-tornado-cash', name: 'Tornado Cash', type: 'other', countries: ['NL'], programs: ['OFAC SDN'], dateAdded: daysAgo(30), source: 'OFAC' },
];

let cachedSanctions: SanctionEntity[] = [];

export async function fetchSanctions(): Promise<SanctionEntity[]> {
  cachedSanctions = FALLBACK_SANCTIONS
    .slice()
    .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
  return cachedSanctions;
}

export function getCachedSanctions(): SanctionEntity[] {
  return cachedSanctions;
}
