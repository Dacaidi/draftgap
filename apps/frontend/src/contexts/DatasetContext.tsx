import {
    JSXElement,
    createContext,
    createEffect,
    createResource,
    createSignal,
    on,
    useContext,
} from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import {
    DATASET_VERSION,
    type Dataset,
} from "@draftgap/core/src/models/dataset/Dataset";
import {
    DEFAULT_DATA_TIER,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";
import type { HostedDatasetManifest } from "@draftgap/core/src/models/dataset/HostedDataset";
import { useUser } from "./UserContext";
import {
    fetchDatasetWithRetry,
    setDatasetFetch,
    type DatasetFetch,
} from "../../../dataset/src/fetch";
import {
    generateDatasets,
    type DatasetGenerationProgress,
} from "../../../dataset/src/index";
import {
    createLocalDatasetCheckpointStore,
    loadLocalDatasetPair,
    saveDownloadedLocalDatasetPair,
    tauriDatasetFetch,
    tauriDatasetFetchWithTimeout,
} from "../api/local-dataset-api";
import { getVersions } from "../../../dataset/src/riot";
import {
    isDatasetShape,
    parseHostedDatasetManifest,
    validateHostedDataset,
} from "../utils/hosted-dataset";
import {
    getDatasetUpdateInfo,
    hasNewerHostedDataset,
} from "../utils/dataset-update";
import { createDatasetUpdateToast } from "../utils/toast";

const HOSTED_DATASET_BASE_URL = "https://dacaidi.github.io/draftgap";
const HOSTED_MANIFEST_FETCH_TIMEOUT_MS = 10_000;
const HOSTED_DATASET_FILE_FETCH_TIMEOUT_MS = 180_000;

type DatasetPair = {
    currentPatch: Dataset;
    thirtyDays: Dataset;
};

export type HostedDatasetStatus = "checking" | "downloading";

export type LocalDatasetUpdate = ReturnType<typeof getDatasetUpdateInfo>;
type DatasetUpdateFeedback = {
    kind: "info" | "success" | "error";
    message: string;
};

async function fetchRemoteDataset(name: "30-days" | "current-patch") {
    const response = await fetch(
        `https://bucket.draftgap.com/datasets/v${DATASET_VERSION}/${name}.json`,
    );
    if (!response.ok) {
        throw new Error(`Could not download ${name}: ${response.status}`);
    }
    return (await response.json()) as Dataset;
}

async function fetchDefaultDatasets(): Promise<DatasetPair> {
    const [currentPatch, thirtyDays] = await Promise.all([
        fetchRemoteDataset("current-patch"),
        fetchRemoteDataset("30-days"),
    ]);
    return { currentPatch, thirtyDays };
}

function getHostedDatasetDirectory(tier: DataTier) {
    return `${HOSTED_DATASET_BASE_URL}/v${DATASET_VERSION}/${tier}`;
}

async function fetchHostedText(
    url: string,
    options: { maxAttempts: number; timeoutMs: number },
) {
    const fetcher: DatasetFetch = isTauri()
        ? (input, init) =>
              tauriDatasetFetchWithTimeout(input, init, options.timeoutMs)
        : fetch;
    const response = await fetchDatasetWithRetry(fetcher, url, undefined, {
        maxAttempts: options.maxAttempts,
        timeoutMs: options.timeoutMs + 5_000,
    });
    return await response.text();
}

async function fetchHostedManifest(tier: DataTier, useFastFallback: boolean) {
    const contents = await fetchHostedText(
        `${getHostedDatasetDirectory(tier)}/manifest.json?t=${Date.now()}`,
        {
            maxAttempts: useFastFallback ? 1 : 3,
            timeoutMs: HOSTED_MANIFEST_FETCH_TIMEOUT_MS,
        },
    );
    return parseHostedDatasetManifest(contents, tier);
}

async function fetchHostedDatasets(
    tier: DataTier,
    manifest: HostedDatasetManifest,
) {
    const directory = getHostedDatasetDirectory(tier);
    const generation = encodeURIComponent(manifest.generationId);
    const [currentPatchJson, thirtyDaysJson] = await Promise.all([
        fetchHostedText(
            `${directory}/${manifest.files.currentPatch.name}?generation=${generation}`,
            {
                maxAttempts: 3,
                timeoutMs: HOSTED_DATASET_FILE_FETCH_TIMEOUT_MS,
            },
        ),
        fetchHostedText(
            `${directory}/${manifest.files.thirtyDays.name}?generation=${generation}`,
            {
                maxAttempts: 3,
                timeoutMs: HOSTED_DATASET_FILE_FETCH_TIMEOUT_MS,
            },
        ),
    ]);
    const [currentPatch, thirtyDays] = await Promise.all([
        validateHostedDataset(currentPatchJson, manifest.files.currentPatch),
        validateHostedDataset(thirtyDaysJson, manifest.files.thirtyDays),
    ]);

    return {
        pair: { currentPatch, thirtyDays } satisfies DatasetPair,
        currentPatchJson,
        thirtyDaysJson,
    };
}

async function loadLocalDatasets(tier: DataTier) {
    let pair;
    try {
        pair = await loadLocalDatasetPair(tier);
    } catch (error) {
        console.warn("Could not load active local dataset pair", error);
        return undefined;
    }
    if (!pair) return undefined;
    const { currentPatch: currentPatchJson, thirtyDays: thirtyDaysJson } = pair;

    try {
        const currentPatch: unknown = JSON.parse(currentPatchJson);
        const thirtyDays: unknown = JSON.parse(thirtyDaysJson);
        if (!isDatasetShape(currentPatch) || !isDatasetShape(thirtyDays)) {
            return undefined;
        }
        return { currentPatch, thirtyDays } satisfies DatasetPair;
    } catch {
        return undefined;
    }
}

function createDatasetContext() {
    const { config } = useUser();
    const desktop = isTauri();
    const [generationProgress, setGenerationProgress] =
        createSignal<DatasetGenerationProgress>();
    const [hostedDatasetStatus, setHostedDatasetStatus] =
        createSignal<HostedDatasetStatus>();
    const [localDatasetUpdate, setLocalDatasetUpdate] =
        createSignal<LocalDatasetUpdate>();
    const [datasetUpdateInfo, setDatasetUpdateInfo] =
        createSignal<LocalDatasetUpdate>();
    const [datasetUpdateCheckError, setDatasetUpdateCheckError] =
        createSignal<string>();
    const [datasetUpdateFeedback, setDatasetUpdateFeedback] =
        createSignal<DatasetUpdateFeedback>();
    const [isRefreshingDatasets, setIsRefreshingDatasets] = createSignal(false);
    const [isCheckingLocalDatasetUpdate, setIsCheckingLocalDatasetUpdate] =
        createSignal(false);
    let updateCheckId = 0;
    let datasetLoadId = 0;

    createEffect(
        on(
            () => config.dataTier,
            () => setDatasetUpdateFeedback(undefined),
        ),
    );

    if (desktop) {
        setDatasetFetch(tauriDatasetFetch);
    }

    const [datasets, { refetch }] = createResource<
        DatasetPair,
        DataTier,
        boolean
    >(
        () => config.dataTier,
        async (tier, info) => {
            const loadId = ++datasetLoadId;
            setGenerationProgress(undefined);
            setHostedDatasetStatus(undefined);

            if (!desktop) {
                const manifest = await fetchHostedManifest(tier, false);
                return (await fetchHostedDatasets(tier, manifest)).pair;
            }

            const localDatasets =
                (await loadLocalDatasets(tier)) ??
                (info.refetching === true ? info.value : undefined);
            try {
                if (loadId === datasetLoadId) {
                    setHostedDatasetStatus("checking");
                }
                const manifest = await fetchHostedManifest(
                    tier,
                    localDatasets !== undefined && info.refetching !== true,
                );
                if (loadId !== datasetLoadId) {
                    throw new Error("Dataset download was superseded");
                }

                if (
                    localDatasets &&
                    !hasNewerHostedDataset(localDatasets, manifest)
                ) {
                    if (info.refetching === true) {
                        setDatasetUpdateFeedback({
                            kind: "info",
                            message:
                                "No newer data has been published. Your current data is still in use.",
                        });
                    }
                    return localDatasets;
                }

                setHostedDatasetStatus("downloading");
                const hosted = await fetchHostedDatasets(tier, manifest);
                if (loadId !== datasetLoadId) {
                    throw new Error("Dataset download was superseded");
                }
                let cached = true;
                try {
                    await saveDownloadedLocalDatasetPair(
                        tier,
                        hosted.currentPatchJson,
                        hosted.thirtyDaysJson,
                    );
                } catch (error) {
                    cached = false;
                    console.warn(
                        "Could not cache downloaded dataset pair",
                        error,
                    );
                }
                if (info.refetching === true) {
                    setDatasetUpdateFeedback({
                        kind: cached ? "success" : "info",
                        message: cached
                            ? `Data updated successfully (patch ${hosted.pair.currentPatch.version}).`
                            : "New data is loaded, but could not be saved locally.",
                    });
                }
                return hosted.pair;
            } catch (error) {
                if (loadId !== datasetLoadId) {
                    throw new Error("Dataset download was superseded", {
                        cause: error,
                    });
                }
                console.warn(`Could not load hosted ${tier} datasets`, error);
                if (info.refetching === true) {
                    setDatasetUpdateFeedback({
                        kind: "error",
                        message: localDatasets
                            ? "Could not check or download new data. Your current data is still in use. Please try again."
                            : "Could not download new data. Please check your connection and try again.",
                    });
                }
                if (localDatasets) return localDatasets;

                if (tier === DEFAULT_DATA_TIER) {
                    try {
                        return await fetchDefaultDatasets();
                    } catch (defaultError) {
                        console.warn(
                            "Could not load DraftGap's default dataset",
                            defaultError,
                        );
                    }
                }
            } finally {
                if (loadId === datasetLoadId) {
                    setHostedDatasetStatus(undefined);
                }
            }

            const checkpointStore = createLocalDatasetCheckpointStore();
            try {
                const generated = await generateDatasets(tier, {
                    onProgress: (progress) => {
                        if (loadId === datasetLoadId) {
                            setGenerationProgress(progress);
                        }
                    },
                    checkpointStore,
                });
                const currentPatchJson = JSON.stringify(generated.currentPatch);
                const thirtyDaysJson = JSON.stringify(generated.thirtyDays);
                if (loadId !== datasetLoadId) {
                    throw new Error("Local dataset build was superseded");
                }
                await checkpointStore.commitPair(
                    currentPatchJson,
                    thirtyDaysJson,
                );
                try {
                    await checkpointStore.clear();
                } catch (error) {
                    console.warn(
                        "Could not clear local dataset checkpoints",
                        error,
                    );
                }
                return generated;
            } finally {
                if (loadId === datasetLoadId) {
                    setGenerationProgress(undefined);
                }
            }
        },
    );

    const dataset = () => datasets()?.currentPatch;
    const dataset30Days = () => datasets()?.thirtyDays;
    const isLoaded = () => datasets.state === "ready" && datasets() != null;
    const refreshLocalDatasets = async () => {
        if (isRefreshingDatasets() || datasets.loading) return;
        const tier = config.dataTier;
        setIsRefreshingDatasets(true);
        setDatasetUpdateFeedback({
            kind: "info",
            message: "Checking for new data...",
        });
        try {
            await refetch(true);
            if (config.dataTier !== tier) return;
            const feedback = datasetUpdateFeedback();
            if (feedback)
                createDatasetUpdateToast(
                    feedback.message,
                    feedback.kind === "error",
                );
        } catch (error) {
            console.error("Could not refresh datasets", error);
            if (config.dataTier !== tier) return;
            const message = "Could not update data. Please try again.";
            setDatasetUpdateFeedback({ kind: "error", message });
            createDatasetUpdateToast(message, true);
        } finally {
            setIsRefreshingDatasets(false);
        }
    };

    createEffect(() => {
        const datasetPair = datasets();
        const tier = config.dataTier;
        const checkId = ++updateCheckId;

        setLocalDatasetUpdate(undefined);
        setDatasetUpdateInfo(undefined);
        setDatasetUpdateCheckError(undefined);
        setIsCheckingLocalDatasetUpdate(false);
        if (!desktop || datasetPair === undefined) {
            return;
        }

        setIsCheckingLocalDatasetUpdate(true);
        void Promise.allSettled([
            getVersions(),
            fetchHostedManifest(tier, true),
        ])
            .then(([versionResult, manifestResult]) => {
                if (checkId !== updateCheckId) return;
                if (manifestResult.status === "rejected") {
                    setDatasetUpdateCheckError(
                        "Could not check published data. Your cached data is still available.",
                    );
                    return;
                }
                const info = getDatasetUpdateInfo(
                    datasetPair,
                    manifestResult.value,
                    versionResult.status === "fulfilled"
                        ? versionResult.value[0]
                        : undefined,
                );
                setDatasetUpdateInfo(info);
                if (info.available) setLocalDatasetUpdate(info);
            })
            .catch((error) => {
                console.error("Could not check local dataset freshness", error);
            })
            .finally(() => {
                if (checkId === updateCheckId) {
                    setIsCheckingLocalDatasetUpdate(false);
                }
            });
    });

    createEffect(() => {
        (window as any).DRAFTGAP_DEBUG = (window as any).DRAFTGAP_DEBUG || {};
        (window as any).DRAFTGAP_DEBUG.dataset = dataset;
        (window as any).DRAFTGAP_DEBUG.dataset30Days = dataset30Days;
    });

    return {
        dataset,
        dataset30Days,
        datasetState: () => datasets.state,
        datasetError: () => datasets.error,
        generationProgress,
        hostedDatasetStatus,
        localDatasetUpdate,
        datasetUpdateInfo,
        datasetUpdateCheckError,
        datasetUpdateFeedback,
        isRefreshingDatasets,
        isCheckingLocalDatasetUpdate,
        isLoaded,
        refreshLocalDatasets,
    };
}

const DatasetContext = createContext<ReturnType<typeof createDatasetContext>>();

export function DatasetProvider(props: { children: JSXElement }) {
    return (
        <DatasetContext.Provider value={createDatasetContext()}>
            {props.children}
        </DatasetContext.Provider>
    );
}

export function useDataset() {
    const useCtx = useContext(DatasetContext);
    if (!useCtx) throw new Error("No DatasetContext found");

    return useCtx;
}
