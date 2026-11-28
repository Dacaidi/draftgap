import { describe, expect, test } from "bun:test";
import type { Dataset } from "@draftgap/core/src/models/dataset/Dataset";
import type { HostedDatasetManifest } from "@draftgap/core/src/models/dataset/HostedDataset";
import { getDatasetUpdateInfo, hasNewerHostedDataset } from "./dataset-update";

const date = "2026-10-07T18:00:00Z";
const newerDate = "2026-10-08T18:00:00Z";
const pair = {
    currentPatch: { version: "16.19.1", date } as Dataset,
    thirtyDays: { version: "30", date } as Dataset,
};
function manifest(version = "16.19.1", generatedDate = date) {
    return {
        tier: "gold_plus",
        generationId: "new-generation",
        files: {
            currentPatch: { version, date: generatedDate },
            thirtyDays: { version: "30", date: generatedDate },
        },
    } as HostedDatasetManifest;
}

describe("dataset update availability", () => {
    test("does not offer a download just because Riot has a newer patch", () => {
        const info = getDatasetUpdateInfo(pair, manifest(), "16.20.1");
        expect(info.available).toBe(false);
        expect(info.patchOutdated).toBe(false);
        expect(info.waitingForPatch).toBe(true);
    });

    test("offers refreshed 30-day data while the new patch is still being prepared", () => {
        const info = getDatasetUpdateInfo(
            pair,
            manifest("16.19.1", newerDate),
            "16.20.1",
        );
        expect(info.available).toBe(true);
        expect(info.patchOutdated).toBe(false);
        expect(info.waitingForPatch).toBe(true);
    });

    test("offers the new patch once it is actually published", () => {
        const info = getDatasetUpdateInfo(
            pair,
            manifest("16.20.1", newerDate),
            "16.20.1",
        );
        expect(info.available).toBe(true);
        expect(info.patchOutdated).toBe(true);
        expect(info.availableVersion).toBe("16.20.1");
        expect(info.waitingForPatch).toBe(false);
    });

    test("never downgrades a newer local patch or a newer local generation", () => {
        expect(
            hasNewerHostedDataset(
                {
                    ...pair,
                    currentPatch: { ...pair.currentPatch, version: "16.20.1" },
                },
                manifest("16.19.1", newerDate),
            ),
        ).toBe(false);
        expect(
            hasNewerHostedDataset(
                pair,
                manifest("16.19.1", "2026-10-06T18:00:00Z"),
            ),
        ).toBe(false);
    });

    test("compares patch numbers numerically rather than lexicographically", () => {
        expect(
            hasNewerHostedDataset(
                {
                    ...pair,
                    currentPatch: { ...pair.currentPatch, version: "16.9.1" },
                },
                manifest("16.10.1", newerDate),
            ),
        ).toBe(true);
    });

    test("checks hosted availability even if Riot's version check fails", () => {
        const info = getDatasetUpdateInfo(pair, manifest("16.20.1", newerDate));
        expect(info.available).toBe(true);
        expect(info.waitingForPatch).toBe(false);
    });
});
