import type { DataTier } from "./DataTier";

export const HOSTED_DATASET_FORMAT_VERSION = 1 as const;

export type HostedDatasetFileName = "current-patch.json" | "30-days.json";

export type HostedDatasetFileMetadata<
    Name extends HostedDatasetFileName = HostedDatasetFileName,
> = {
    name: Name;
    version: string;
    date: string;
    bytes: number;
    sha256: string;
    championCount: number;
};

export type HostedDatasetManifest = {
    formatVersion: typeof HOSTED_DATASET_FORMAT_VERSION;
    datasetVersion: string;
    tier: DataTier;
    generationId: string;
    generatedAt: string;
    files: {
        currentPatch: HostedDatasetFileMetadata<"current-patch.json">;
        thirtyDays: HostedDatasetFileMetadata<"30-days.json">;
    };
};
