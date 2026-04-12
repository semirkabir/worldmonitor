// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface PlatformGiving { platform: string; dailyVolumeUsd: number; activeCampaignsSampled: number; newCampaigns24h: number; donationVelocity: number; dataFreshness: string; lastUpdated: string; }
export interface CategoryBreakdown { category: string; share: number; change24h: number; activeCampaigns: number; trending: boolean; }
export interface CryptoGivingSummary { dailyInflowUsd: number; trackedWallets: number; transactions24h: number; topReceivers: string[]; pctOfTotal: number; }
export interface InstitutionalGiving { oecdOdaAnnualUsdBn: number; oecdDataYear: number; cafWorldGivingIndex: number; cafDataYear: number; candidGrantsTracked: number; dataLag: string; }
export interface GivingSummary { generatedAt: string; activityIndex: number; trend: string; estimatedDailyFlowUsd: number; platforms: PlatformGiving[]; categories: CategoryBreakdown[]; crypto: CryptoGivingSummary; institutional: InstitutionalGiving; }

export interface GetGivingSummaryResponse { summary: GivingSummary; }

export class GivingServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('giving', baseURL, options); }
  declare getGivingSummary: (req?: { platformLimit?: number; categoryLimit?: number }) => Promise<GetGivingSummaryResponse>;
}
