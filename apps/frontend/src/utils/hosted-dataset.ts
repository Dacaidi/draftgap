import {
    DATASET_VERSION,
    type Dataset,
} from "@draftgap/core/src/models/dataset/Dataset";
import type { DataTier } from "@draftgap/core/src/models/dataset/DataTier";
import { SOURCE_TIME_BUCKETS } from "@draftgap/core/src/models/dataset/time-buckets";
import {
    HOSTED_DATASET_FORMAT_VERSION,
    type HostedDatasetFileMetadata,
    type HostedDatasetManifest,
} from "@draftgap/core/src/models/dataset/HostedDataset";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GENERATION_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidTimeBuckets(value: unknown) {
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > SOURCE_TIME_BUCKETS.length
    ) {
        return false;
    }

    let previousEnd: number | null = 0;
    let previousSourceEnd = -1;
    let totalShare = 0;

    for (const candidate of value) {
        if (!isRecord(candidate)) return false;

        const { start, end, gameShare, sourceBucketStart, sourceBucketEnd } =
            candidate;
        if (
            typeof start !== "number" ||
            !Number.isFinite(start) ||
            start !== previousEnd ||
            (end !== null &&
                (typeof end !== "number" ||
                    !Number.isFinite(end) ||
                    end <= start)) ||
            typeof gameShare !== "number" ||
            !Number.isFinite(gameShare) ||
            gameShare < 0 ||
            gameShare > 1 ||
            typeof sourceBucketStart !== "number" ||
            !Number.isInteger(sourceBucketStart) ||
            typeof sourceBucketEnd !== "number" ||
            !Number.isInteger(sourceBucketEnd) ||
            sourceBucketStart !== previousSourceEnd + 1 ||
            sourceBucketEnd < sourceBucketStart ||
            sourceBucketEnd >= SOURCE_TIME_BUCKETS.length
        ) {
            return false;
        }

        if (
            start !== SOURCE_TIME_BUCKETS[sourceBucketStart]!.start ||
            end !== SOURCE_TIME_BUCKETS[sourceBucketEnd]!.end
        ) {
            return false;
        }

        previousEnd = end as number | null;
        previousSourceEnd = sourceBucketEnd;
        totalShare += gameShare;
    }

    return (
        previousEnd === null &&
        previousSourceEnd === SOURCE_TIME_BUCKETS.length - 1 &&
        (Math.abs(totalShare - 1) < 1e-6 || totalShare === 0)
    );
}

function hasValidChampionTimeStats(
    championData: Record<string, unknown>,
    timeBucketCount: number,
) {
    if (Object.keys(championData).length === 0) return false;

    for (const champion of Object.values(championData)) {
        if (!isRecord(champion) || !isRecord(champion.statsByRole)) {
            return false;
        }

        for (const role of [0, 1, 2, 3, 4]) {
            const roleData = champion.statsByRole[role];
            if (
                !isRecord(roleData) ||
                !Array.isArray(roleData.statsByTime) ||
                roleData.statsByTime.length !== timeBucketCount
            ) {
                return false;
            }

            for (const stats of roleData.statsByTime) {
                if (
                    !isRecord(stats) ||
                    typeof stats.games !== "number" ||
                    !Number.isFinite(stats.games) ||
                    typeof stats.wins !== "number" ||
                    !Number.isFinite(stats.wins) ||
                    stats.games < 0 ||
                    stats.wins < 0 ||
                    stats.wins > stats.games
                ) {
                    return false;
                }
            }
        }
    }

    return true;
}

function parseFileMetadata(
    value: unknown,
    expectedName: HostedDatasetFileMetadata["name"],
) {
    if (!isRecord(value)) return undefined;

    const metadata = value as Partial<HostedDatasetFileMetadata>;
    if (
        metadata.name !== expectedName ||
        typeof metadata.version !== "string" ||
        metadata.version.length === 0 ||
        !isValidDate(metadata.date) ||
        !Number.isSafeInteger(metadata.bytes) ||
        (metadata.bytes ?? 0) <= 0 ||
        typeof metadata.sha256 !== "string" ||
        !SHA256_PATTERN.test(metadata.sha256) ||
        !Number.isSafeInteger(metadata.championCount) ||
        (metadata.championCount ?? 0) <= 0
    ) {
        return undefined;
    }

    return metadata as HostedDatasetFileMetadata;
}

export function parseHostedDatasetManifest(
    contents: string,
    expectedTier: DataTier,
) {
    let value: unknown;
    try {
        value = JSON.parse(contents);
    } catch {
        throw new Error("Hosted dataset manifest is not valid JSON");
    }
    if (!isRecord(value) || !isRecord(value.files)) {
        throw new Error("Hosted dataset manifest has an invalid structure");
    }

    const currentPatch = parseFileMetadata(
        value.files.currentPatch,
        "current-patch.json",
    );
    const thirtyDays = parseFileMetadata(
        value.files.thirtyDays,
        "30-days.json",
    );
    if (
        value.formatVersion !== HOSTED_DATASET_FORMAT_VERSION ||
        value.datasetVersion !== DATASET_VERSION ||
        value.tier !== expectedTier ||
        typeof value.generationId !== "string" ||
        !GENERATION_ID_PATTERN.test(value.generationId) ||
        !isValidDate(value.generatedAt) ||
        !currentPatch ||
        !thirtyDays ||
        thirtyDays.version !== "30"
    ) {
        throw new Error("Hosted dataset manifest is incompatible");
    }

    return value as HostedDatasetManifest;
}

export function isDatasetShape(value: unknown): value is Dataset {
    if (!isRecord(value)) return false;

    const validTimeBuckets = isValidTimeBuckets(value.timeBuckets);
    const validChampionData =
        isRecord(value.championData) &&
        validTimeBuckets &&
        hasValidChampionTimeStats(
            value.championData,
            (value.timeBuckets as unknown[]).length,
        );

    return (
        typeof value.version === "string" &&
        isValidDate(value.date) &&
        validTimeBuckets &&
        validChampionData &&
        isRecord(value.itemData) &&
        isRecord(value.runeData) &&
        isRecord(value.runePathData) &&
        isRecord(value.statShardData) &&
        isRecord(value.summonerSpellData)
    );
}

function bytesToHex(bytes: Uint8Array) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
    );
}

export async function validateHostedDataset(
    contents: string,
    metadata: HostedDatasetFileMetadata,
) {
    const encoded = new TextEncoder().encode(contents);
    if (encoded.byteLength !== metadata.bytes) {
        throw new Error(`Hosted ${metadata.name} has an unexpected size`);
    }

    const digest = await crypto.subtle.digest("SHA-256", encoded);
    if (bytesToHex(new Uint8Array(digest)) !== metadata.sha256) {
        throw new Error(`Hosted ${metadata.name} failed its checksum`);
    }

    let value: unknown;
    try {
        value = JSON.parse(contents);
    } catch {
        throw new Error(`Hosted ${metadata.name} is not valid JSON`);
    }
    if (
        !isDatasetShape(value) ||
        value.version !== metadata.version ||
        value.date !== metadata.date ||
        Object.keys(value.championData).length !== metadata.championCount
    ) {
        throw new Error(`Hosted ${metadata.name} does not match its manifest`);
    }

    return value;
}

export function datasetPairMatchesManifest(
    pair: { currentPatch: Dataset; thirtyDays: Dataset },
    manifest: HostedDatasetManifest,
) {
    return (
        pair.currentPatch.version === manifest.files.currentPatch.version &&
        pair.currentPatch.date === manifest.files.currentPatch.date &&
        Object.keys(pair.currentPatch.championData).length ===
            manifest.files.currentPatch.championCount &&
        pair.thirtyDays.version === manifest.files.thirtyDays.version &&
        pair.thirtyDays.date === manifest.files.thirtyDays.date &&
        Object.keys(pair.thirtyDays.championData).length ===
            manifest.files.thirtyDays.championCount
    );
}
