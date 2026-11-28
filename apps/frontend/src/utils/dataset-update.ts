import type { Dataset } from "@draftgap/core/src/models/dataset/Dataset";
import type { HostedDatasetManifest } from "@draftgap/core/src/models/dataset/HostedDataset";

export type DatasetPair = { currentPatch: Dataset; thirtyDays: Dataset };

function comparePatchVersions(left: string, right: string) {
    const leftParts = left.split(".").map(Number);
    const rightParts = right.split(".").map(Number);
    for (
        let index = 0;
        index < Math.max(leftParts.length, rightParts.length);
        index++
    ) {
        const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

export function hasNewerHostedDataset(
    pair: DatasetPair,
    manifest: HostedDatasetManifest,
) {
    const patchDifference = comparePatchVersions(
        manifest.files.currentPatch.version,
        pair.currentPatch.version,
    );
    if (patchDifference < 0) return false;
    const currentPatchDifference =
        Date.parse(manifest.files.currentPatch.date) -
        Date.parse(pair.currentPatch.date);
    const thirtyDaysDifference =
        Date.parse(manifest.files.thirtyDays.date) -
        Date.parse(pair.thirtyDays.date);
    if (
        !Number.isFinite(currentPatchDifference) ||
        !Number.isFinite(thirtyDaysDifference)
    )
        return false;
    // Do not replace a newer local build with older hosted data.
    return (
        (patchDifference > 0 || currentPatchDifference >= 0) &&
        thirtyDaysDifference >= 0 &&
        (patchDifference > 0 ||
            currentPatchDifference > 0 ||
            thirtyDaysDifference > 0)
    );
}

export function getDatasetUpdateInfo(
    pair: DatasetPair,
    manifest: HostedDatasetManifest,
    currentVersion?: string,
    now = Date.now(),
) {
    const generatedAt = Date.parse(pair.thirtyDays.date);
    const thirtyDaysAgeDays = Number.isFinite(generatedAt)
        ? Math.floor(Math.max(0, now - generatedAt) / 86_400_000)
        : undefined;
    return {
        tier: manifest.tier,
        generationId: manifest.generationId,
        cachedVersion: pair.currentPatch.version,
        availableVersion: manifest.files.currentPatch.version,
        currentVersion,
        available: hasNewerHostedDataset(pair, manifest),
        patchOutdated:
            comparePatchVersions(
                manifest.files.currentPatch.version,
                pair.currentPatch.version,
            ) > 0,
        waitingForPatch:
            currentVersion !== undefined &&
            comparePatchVersions(
                currentVersion,
                manifest.files.currentPatch.version,
            ) > 0 &&
            comparePatchVersions(currentVersion, pair.currentPatch.version) > 0,
        thirtyDaysAgeDays,
        thirtyDaysStale:
            thirtyDaysAgeDays === undefined || thirtyDaysAgeDays >= 7,
    };
}
