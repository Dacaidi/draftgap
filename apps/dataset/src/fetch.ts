export type DatasetFetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

export const DATASET_FETCH_TIMEOUT_MS = 30_000;

let activeFetch: DatasetFetch = (input, init) => globalThis.fetch(input, init);

export function setDatasetFetch(fetcher: DatasetFetch) {
    activeFetch = fetcher;
}

export async function datasetFetch(
    input: string | URL | Request,
    init?: RequestInit,
) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(init?.signal?.reason);
    if (init?.signal?.aborted) {
        abortFromCaller();
    } else {
        init?.signal?.addEventListener("abort", abortFromCaller, {
            once: true,
        });
    }
    const timeout = setTimeout(
        () => controller.abort("Dataset request timed out"),
        DATASET_FETCH_TIMEOUT_MS,
    );

    try {
        return await activeFetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
        init?.signal?.removeEventListener("abort", abortFromCaller);
    }
}
