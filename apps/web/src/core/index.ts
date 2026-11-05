/** CUA DUY NHAT cua core. Tang dung chung: khong biet nghiep vu, khong biet feature nao. */
export { pageTitle, STORE_NAME, STORE_TAGLINE } from './brand.js';
export { formatDateTime, formatPrice } from './format.js';
export {
  apiDel,
  ApiError,
  type ApiErrorBody,
  apiGet,
  type ApiGetOptions,
  apiPatch,
  apiPost,
  apiRequest,
  type ApiRequestOptions,
  openEventStream,
  type Page,
  type QueryParams,
  setAccessTokenGetter,
} from './http.js';
export { queryClient } from './queryClient.js';
export {
  classifyRequestError,
  requestErrorCode,
  type RequestErrorKind,
  type RequestTarget,
  shouldRetryRequest,
} from './request-errors.js';
export { isAdminQueryForActor, samePaginatedQuery, sessionQueryKeys } from './session-cache.js';
