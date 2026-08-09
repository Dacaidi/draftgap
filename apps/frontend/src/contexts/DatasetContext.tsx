import {
    JSXElement,
    createContext,
    createEffect,
    createResource,
    createSignal,
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
    datasetPairMatchesManifest,
    isDatasetShape,
    parseHostedDatasetManifest,
    validateHostedDataset,
} from "../utils/hosted-dataset";

const LOCAL_DATASET_MAX_AGE_DAYS = 7;
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const HOSTED_DATASET_BASE_URL = "https://dacaidi.github.io/draftgap";
const HOSTED_MANIFEST_FETCH_TIMEOUT_MS = 10_000;
const HOSTED_DATASET_FILE_FETCH_TIMEOUT_MS = 180_000;

type DatasetPair = {
    currentPatch: Dataset;
    thirtyDays: Dataset;
};

export type HostedDatasetStatus = "checking" | "downloading";

export type LocalDatasetUpdate = {
    tier: DataTier;
    currentVersion: string;
    cachedVersion: string;
    patchOutdated: boolean;
    thirtyDaysStale: boolean;
    thirtyDaysAgeDays?: number;
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
    const response = await fetchDatasetWithRetry(
        (input, init) =>
            tauriDatasetFetchWithTimeout(input, init, options.timeoutMs),
        url,
        undefined,
        {
            maxAttempts: options.maxAttempts,
            timeoutMs: options.timeoutMs + 5_000,
        },
    );
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
    const [isCheckingLocalDatasetUpdate, setIsCheckingLocalDatasetUpdate] =
        createSignal(false);
    let updateCheckId = 0;
    let datasetLoadId = 0;

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
                return await fetchDefaultDatasets();
            }

            const localDatasets = await loadLocalDatasets(tier);
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
                    datasetPairMatchesManifest(localDatasets, manifest)
                ) {
                    return localDatasets;
                }

                setHostedDatasetStatus("downloading");
                const hosted = await fetchHostedDatasets(tier, manifest);
                if (loadId !== datasetLoadId) {
                    throw new Error("Dataset download was superseded");
                }
                try {
                    await saveDownloadedLocalDatasetPair(
                        tier,
                        hosted.currentPatchJson,
                        hosted.thirtyDaysJson,
                    );
                } catch (error) {
                    console.warn(
                        "Could not cache downloaded dataset pair",
                        error,
                    );
                }
                return hosted.pair;
            } catch (error) {
                if (loadId !== datasetLoadId) {
                    throw new Error("Dataset download was superseded", {
                        cause: error,
                    });
                }
                console.warn(`Could not load hosted ${tier} datasets`, error);
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
    const refreshLocalDatasets = () => refetch(true);

    createEffect(() => {
        const datasetPair = datasets();
        const tier = config.dataTier;
        const checkId = ++updateCheckId;

        setLocalDatasetUpdate(undefined);
        setIsCheckingLocalDatasetUpdate(false);
        if (!desktop || datasetPair === undefined) {
            return;
        }

        setIsCheckingLocalDatasetUpdate(true);
        void getVersions()
            .then((versions) => {
                if (checkId !== updateCheckId) return;

                const currentVersion = versions[0];
                if (!currentVersion) return;

                const generatedAt = new Date(
                    datasetPair.thirtyDays.date,
                ).getTime();
                const thirtyDaysAgeDays = Number.isFinite(generatedAt)
                    ? Math.floor(
                          Math.max(0, Date.now() - generatedAt) /
                              MILLISECONDS_PER_DAY,
                      )
                    : undefined;
                const patchOutdated =
                    datasetPair.currentPatch.version !== currentVersion;
                const thirtyDaysStale =
                    thirtyDaysAgeDays === undefined ||
                    thirtyDaysAgeDays >= LOCAL_DATASET_MAX_AGE_DAYS;

                if (!patchOutdated && !thirtyDaysStale) return;

                setLocalDatasetUpdate({
                    tier,
                    currentVersion,
                    cachedVersion: datasetPair.currentPatch.version,
                    patchOutdated,
                    thirtyDaysStale,
                    thirtyDaysAgeDays,
                });
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
