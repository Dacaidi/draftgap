export type DatasetFetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

let activeFetch: DatasetFetch = (input, init) => globalThis.fetch(input, init);

export function setDatasetFetch(fetcher: DatasetFetch) {
    activeFetch = fetcher;
}

export function datasetFetch(
    input: string | URL | Request,
    init?: RequestInit,
) {
    return activeFetch(input, init);
}
