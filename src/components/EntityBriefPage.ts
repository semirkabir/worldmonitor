import { sanitizeUrl } from '@/utils/sanitize';

export type EntityBriefType =
  | 'news' | 'hotspot' | 'conflict' | 'base'
  | 'pipeline' | 'cable' | 'datacenter' | 'nuclear'
  | 'irradiator' | 'techcompany' | 'ailab' | 'startup'
  | 'techhq' | 'accelerator' | 'exchange' | 'financialcenter'
  | 'centralbank' | 'commodityhub';
