export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';
export class ResearchServiceClient extends GenericServiceClient { constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('research', baseURL, options); } }
