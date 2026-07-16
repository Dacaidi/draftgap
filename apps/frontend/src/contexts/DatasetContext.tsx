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
import { useUser } from "./UserContext";
import { setDatasetFetch } from "../../../dataset/src/fetch";
import {
    generateDatasets,
    type DatasetGenerationProgress,
} from "../../../dataset/src/index";
import {
    loadLocalDataset,
    saveLocalDataset,
    tauriDatasetFetch,
} from "../api/local-dataset-api";

type DatasetPair = {
    currentPatch: Dataset;
    thirtyDays: Dataset;
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

async function loadLocalDatasets(tier: DataTier) {
    const [currentPatchJson, thirtyDaysJson] = await Promise.all([
        loadLocalDataset(tier, "current-patch"),
        loadLocalDataset(tier, "30-days"),
    ]);
    if (!currentPatchJson || !thirtyDaysJson) return undefined;

    try {
        return {
            currentPatch: JSON.parse(currentPatchJson) as Dataset,
            thirtyDays: JSON.parse(thirtyDaysJson) as Dataset,
        } satisfies DatasetPair;
    } catch {
        return undefined;
    }
}

function createDatasetContext() {
    const { config } = useUser();
    const desktop = isTauri();
    const [generationProgress, setGenerationProgress] =
        createSignal<DatasetGenerationProgress>();

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
            setGenerationProgress(undefined);

            if (!desktop || tier === DEFAULT_DATA_TIER) {
                return await fetchDefaultDatasets();
            }

            if (info.refetching !== true) {
                const localDatasets = await loadLocalDatasets(tier);
                if (localDatasets) return localDatasets;
            }

            const generated = await generateDatasets(
                tier,
                setGenerationProgress,
                2,
            );
            await Promise.all([
                saveLocalDataset(
                    tier,
                    "current-patch",
                    JSON.stringify(generated.currentPatch),
                ),
                saveLocalDataset(
                    tier,
                    "30-days",
                    JSON.stringify(generated.thirtyDays),
                ),
            ]);
            setGenerationProgress(undefined);
            return generated;
        },
    );

    const dataset = () => datasets()?.currentPatch;
    const dataset30Days = () => datasets()?.thirtyDays;
    const isLoaded = () => datasets.state === "ready" && datasets() != null;
    const refreshLocalDatasets = () => refetch(true);

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
