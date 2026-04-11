export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';
export class NaturalServiceClient extends GenericServiceClient { constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('natural', baseURL, options); } }
