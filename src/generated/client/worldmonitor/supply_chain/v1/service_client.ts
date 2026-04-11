export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';
export class SupplyChainServiceClient extends GenericServiceClient { constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('supply-chain', baseURL, options); } }
