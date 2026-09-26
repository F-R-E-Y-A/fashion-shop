import { CollectorError, type FetchResult } from '../../contracts/product-source-adapter.ts';

export const YODY_USER_AGENT =
  'fashion-shop-ht03-research/1.0 (student project; https://github.com/F-R-E-Y-A/fashion-shop)';

export interface FetchPolicy {
  timeoutMs: number;
  maxRetries: number;
  backoffMs: readonly number[];
  jitterMs: number;
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  timeoutMs: 15_000,
  maxRetries: 2,
  backoffMs: [5_000, 15_000],
  jitterMs: 500,
};

export type Sleep = (milliseconds: number) => Promise<void>;

export const sleep: Sleep = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function looksLikeActiveChallenge(response: Response, body: string): boolean {
  if (response.headers.get('cf-mitigated')?.toLowerCase() === 'challenge') return true;
  const sample = body.slice(0, 50_000).toLowerCase();
  return (
    sample.includes('<title>just a moment...</title>') ||
    sample.includes('/cdn-cgi/challenge-platform/') ||
    sample.includes('cf-chl-')
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('timed out'))
  );
}

async function waitBeforeRetry(
  response: Response | null,
  retryIndex: number,
  policy: FetchPolicy,
  wait: Sleep,
  random: () => number,
): Promise<void> {
  const configured = policy.backoffMs[retryIndex] ?? policy.backoffMs.at(-1) ?? 0;
  const retryAfter = response ? retryAfterMilliseconds(response.headers.get('retry-after')) : null;
  const delay = Math.max(configured, retryAfter ?? 0) + Math.floor(random() * policy.jitterMs);
  await wait(delay);
}

export async function fetchTextWithPolicy(
  url: string,
  options: {
    policy?: FetchPolicy;
    fetchImpl?: typeof fetch;
    wait?: Sleep;
    random?: () => number;
  } = {},
): Promise<FetchResult> {
  const policy = options.policy ?? DEFAULT_FETCH_POLICY;
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? sleep;
  const random = options.random ?? Math.random;
  let requestLatencyMs = 0;

  for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt += 1) {
    const startedAt = performance.now();
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: 'text/html,application/xml;q=0.9,text/xml;q=0.8',
          'user-agent': YODY_USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(policy.timeoutMs),
      });
      const body = await response.text();
      requestLatencyMs += Math.round(performance.now() - startedAt);

      if (response.status === 403 || looksLikeActiveChallenge(response, body)) {
        throw new CollectorError(
          'ACCESS_BLOCKED',
          `YODY blocked access or returned a challenge for ${url}`,
          {
            stopRun: true,
            httpStatus: response.status,
            attempts: attempt,
            latencyMs: requestLatencyMs,
          },
        );
      }

      if (response.ok) {
        return { body, status: response.status, attempts: attempt, latencyMs: requestLatencyMs };
      }

      if (!isRetryableStatus(response.status) || attempt > policy.maxRetries) {
        throw new CollectorError('HTTP_ERROR', `HTTP ${response.status} while fetching ${url}`, {
          httpStatus: response.status,
          attempts: attempt,
          latencyMs: requestLatencyMs,
        });
      }

      await waitBeforeRetry(response, attempt - 1, policy, wait, random);
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      requestLatencyMs += Math.round(performance.now() - startedAt);
      if (attempt > policy.maxRetries) {
        const code = isTimeoutError(error) ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR';
        throw new CollectorError(code, `Network failure while fetching ${url}`, {
          attempts: attempt,
          latencyMs: requestLatencyMs,
          cause: error,
        });
      }
      await waitBeforeRetry(response, attempt - 1, policy, wait, random);
    }
  }

  throw new CollectorError('INTERNAL_ERROR', `Unexpected fetch loop exit for ${url}`);
}

export function randomProductDelay(random = Math.random): number {
  return 2_000 + Math.floor(random() * 1_001);
}
