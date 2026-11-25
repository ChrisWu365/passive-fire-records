import { ApiError } from '../api/api-error';

const NETWORK_FAILURE = 0;
/** Gateway answers that mean the service behind it is down or not answering. */
const GATEWAY_DOWN = [502, 503, 504];

/** True when the request never got an answer: no connection, or the server is not there at all. */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && error.status === NETWORK_FAILURE;
}

/**
 * True when a service could not be reached: no answer at all, or the gateway reporting that the service
 * behind it is down. False for every answer the service itself gave, such as an expired sign-in.
 */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === NETWORK_FAILURE || GATEWAY_DOWN.includes(error.status));
}
