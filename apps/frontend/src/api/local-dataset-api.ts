import { invoke } from "@tauri-apps/api/core";
import { DATASET_VERSION } from "@draftgap/core/src/models/dataset/Dataset";
import type { DataTier } from "@draftgap/core/src/models/dataset/DataTier";
import type { DatasetFetch } from "../../../dataset/src/fetch";

type DatasetName = "current-patch" | "30-days";

type DatasetHttpResponse = {
    status: number;
    body: string;
};

export const tauriDatasetFetch: DatasetFetch = async (input, init) => {
    const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "GET") {
        throw new Error("Local dataset fetch only supports GET requests");
    }

    const url =
        typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
    const response = await invoke<DatasetHttpResponse>("fetch_dataset_url", {
        url,
    });

    return new Response(response.body, {
        status: response.status,
    });
};

export async function loadLocalDataset(tier: DataTier, name: DatasetName) {
    return await invoke<string | null>("load_local_dataset", {
        datasetVersion: DATASET_VERSION,
        tier,
        name,
    });
}

export async function saveLocalDataset(
    tier: DataTier,
    name: DatasetName,
    contents: string,
) {
    await invoke("save_local_dataset", {
        datasetVersion: DATASET_VERSION,
        tier,
        name,
        contents,
    });
}
