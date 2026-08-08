export type DatasetFetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

export const DATASET_FETCH_TIMEOUT_MS = 30_000;
export const DATASET_FETCH_CONCURRENCY = 16;

const DATASET_FETCH_MAX_ATTEMPTS = 5;
const DATASET_FETCH_RETRY_BASE_DELAY_MS = 500;
const DATASET_FETCH_RETRY_MAX_DELAY_MS = 30_000;
const DATASET_FETCH_MAX_RETRY_AFTER_MS = 5 * 60_000;

export type DatasetFetchRetryOptions = {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
    random?: () => number;
    now?: () => number;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
    runAttempt?: <T>(
        operation: () => Promise<T>,
        signal?: AbortSignal,
    ) => Promise<T>;
};

type QueuedRequest = {
    resolve: () => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    abort?: () => void;
};

export class DatasetHttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly url: string,
        public readonly retryAfterMs?: number,
    ) {
        super(`Dataset request failed with ${status}: ${url}`);
        this.name = "DatasetHttpError";
    }
}

export class DatasetRequestLimiter {
    private activeRequests = 0;
    private readonly queue: QueuedRequest[] = [];

    constructor(private readonly limit: number) {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error("Dataset request concurrency must be positive");
        }
    }

    async run<T>(operation: () => Promise<T>, signal?: AbortSignal) {
        await this.acquire(signal);
        try {
            return await operation();
        } finally {
            this.release();
        }
    }

    private async acquire(signal?: AbortSignal) {
        if (signal?.aborted) {
            throw abortError(signal.reason);
        }

        if (this.activeRequests < this.limit) {
            this.activeRequests++;
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const request: QueuedRequest = { resolve, reject, signal };
            request.abort = () => {
                const index = this.queue.indexOf(request);
                if (index >= 0) this.queue.splice(index, 1);
                reject(abortError(signal?.reason));
            };
            signal?.addEventListener("abort", request.abort, { once: true });
            this.queue.push(request);
        });
    }

    private release() {
        const next = this.queue.shift();
        if (!next) {
            this.activeRequests--;
            return;
        }

        next.signal?.removeEventListener("abort", next.abort!);
        next.resolve();
    }
}

const requestLimiter = new DatasetRequestLimiter(DATASET_FETCH_CONCURRENCY);
let activeFetch: DatasetFetch = (input, init) => globalThis.fetch(input, init);

export function setDatasetFetch(fetcher: DatasetFetch) {
    activeFetch = fetcher;
}

function abortError(reason?: unknown) {
    if (reason instanceof Error) return reason;
    return new DOMException(
        typeof reason === "string" ? reason : "The operation was aborted",
        "AbortError",
    );
}

function getRequestUrl(input: string | URL | Request) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

function getCallerSignal(input: string | URL | Request, init?: RequestInit) {
    return (
        init?.signal ??
        (input instanceof Request ? input.signal : undefined) ??
        undefined
    );
}

function isRetryableStatus(status: number) {
    return (
        status === 408 ||
        status === 425 ||
        status === 429 ||
        (status >= 500 && status <= 599)
    );
}

function parseRetryAfter(value: string | null, now: () => number) {
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }

    const date = Date.parse(value);
    if (!Number.isFinite(date)) return undefined;
    return Math.max(0, date - now());
}

async function sleep(delayMs: number, signal?: AbortSignal) {
    if (signal?.aborted) throw abortError(signal.reason);

    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            signal?.removeEventListener("abort", abort);
            resolve();
        };
        const timeout = setTimeout(finish, delayMs);
        const abort = () => {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", abort);
            reject(abortError(signal?.reason));
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
    });
}

async function fetchOnce(
    fetcher: DatasetFetch,
    input: string | URL | Request,
    init: RequestInit | undefined,
    callerSignal: AbortSignal | undefined,
    timeoutMs: number,
) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) {
        abortFromCaller();
    } else {
        callerSignal?.addEventListener("abort", abortFromCaller, {
            once: true,
        });
    }
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort("Dataset request timed out");
    }, timeoutMs);

    try {
        const response = await fetcher(input, {
            ...init,
            signal: controller.signal,
        });
        if (callerSignal?.aborted) {
            await response.body?.cancel().catch(() => {});
            throw abortError(callerSignal.reason);
        }
        if (timedOut) {
            await response.body?.cancel().catch(() => {});
            throw new Error(
                `Dataset request timed out: ${getRequestUrl(input)}`,
            );
        }
        return response;
    } catch (error) {
        if (callerSignal?.aborted) throw abortError(callerSignal.reason);
        if (timedOut) {
            throw new Error(
                `Dataset request timed out: ${getRequestUrl(input)}`,
                {
                    cause: error,
                },
            );
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        callerSignal?.removeEventListener("abort", abortFromCaller);
    }
}

export async function fetchDatasetWithRetry(
    fetcher: DatasetFetch,
    input: string | URL | Request,
    init?: RequestInit,
    options: DatasetFetchRetryOptions = {},
) {
    const maxAttempts = Math.max(
        1,
        Math.floor(options.maxAttempts ?? DATASET_FETCH_MAX_ATTEMPTS),
    );
    const baseDelayMs =
        options.baseDelayMs ?? DATASET_FETCH_RETRY_BASE_DELAY_MS;
    const maxDelayMs = options.maxDelayMs ?? DATASET_FETCH_RETRY_MAX_DELAY_MS;
    const timeoutMs = options.timeoutMs ?? DATASET_FETCH_TIMEOUT_MS;
    const random = options.random ?? Math.random;
    const now = options.now ?? Date.now;
    const wait = options.sleep ?? sleep;
    const runAttempt = options.runAttempt ?? (async (operation) => operation());
    const url = getRequestUrl(input);
    const callerSignal = getCallerSignal(input, init);
    if (callerSignal?.aborted) throw abortError(callerSignal.reason);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await runAttempt(
                () => fetchOnce(fetcher, input, init, callerSignal, timeoutMs),
                callerSignal,
            );
            if (response.ok) return response;

            const retryAfterMs = parseRetryAfter(
                response.headers.get("Retry-After"),
                now,
            );
            const error = new DatasetHttpError(
                response.status,
                url,
                retryAfterMs,
            );
            await response.body?.cancel().catch(() => {});
            if (!isRetryableStatus(response.status)) throw error;
            throw error;
        } catch (error) {
            if (callerSignal?.aborted) throw error;

            const retryable =
                !(error instanceof DatasetHttpError) ||
                isRetryableStatus(error.status);
            if (!retryable || attempt + 1 >= maxAttempts) throw error;

            const exponentialDelay = Math.min(
                maxDelayMs,
                baseDelayMs * 2 ** attempt,
            );
            const jitteredDelay = exponentialDelay * (0.5 + random() * 0.5);
            const retryAfterMs =
                error instanceof DatasetHttpError
                    ? error.retryAfterMs
                    : undefined;
            if (
                retryAfterMs !== undefined &&
                retryAfterMs > DATASET_FETCH_MAX_RETRY_AFTER_MS
            ) {
                throw error;
            }
            const retryAfterJitter =
                retryAfterMs === undefined ? 0 : random() * baseDelayMs;
            const delayMs =
                Math.max(jitteredDelay, retryAfterMs ?? 0) + retryAfterJitter;

            console.log(
                `Retrying dataset request ${url} in ${Math.round(delayMs)}ms`,
                error,
            );
            await wait(delayMs, callerSignal);
        }
    }

    throw new Error(`Dataset request failed: ${url}`);
}

export async function datasetFetch(
    input: string | URL | Request,
    init?: RequestInit,
) {
    return await fetchDatasetWithRetry(activeFetch, input, init, {
        runAttempt: (operation, signal) =>
            requestLimiter.run(operation, signal),
    });
}
