// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface GlobalDisplacementTotals { refugees: number; asylumSeekers: number; idps: number; stateless: number; total: number; }
export interface CountryDisplacement { code: string; name: string; refugees: number; asylumSeekers: number; idps: number; stateless: number; totalDisplaced: number; hostRefugees: number; hostAsylumSeekers: number; hostTotal: number; location: { latitude: number; longitude: number }; }
export interface DisplacementFlow { originCode: string; originName: string; asylumCode: string; asylumName: string; refugees: number; originLocation: { latitude: number; longitude: number }; asylumLocation: { latitude: number; longitude: number }; }
export interface DisplacementSummary { year: number; globalTotals: GlobalDisplacementTotals; countries: CountryDisplacement[]; topFlows: DisplacementFlow[]; }
export interface CountryPopulationEntry { code: string; name: string; population: number; densityPerKm2: number; }
export interface ExposureResult { exposedPopulation: number; exposureRadiusKm: number; nearestCountry: string; densityPerKm2: number; }

export interface GetDisplacementSummaryResponse { summary: DisplacementSummary; }
export interface GetPopulationExposureResponse { success: boolean; countries: CountryPopulationEntry[]; exposure?: ExposureResult; }

export class DisplacementServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('displacement', baseURL, options); }
  declare getDisplacementSummary: (req?: { year?: number; countryLimit?: number; flowLimit?: number }) => Promise<GetDisplacementSummaryResponse>;
  declare getPopulationExposure: (req?: { mode?: string; lat?: number; lon?: number; radius?: number }) => Promise<GetPopulationExposureResponse>;
}
