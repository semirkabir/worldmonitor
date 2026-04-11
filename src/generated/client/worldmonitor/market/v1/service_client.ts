export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';
export class MarketServiceClient extends GenericServiceClient { constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('market', baseURL, options); } }
