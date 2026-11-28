import { describe, expect, it } from "bun:test";
import {
    DATASET_VERSION,
    type Dataset,
} from "@draftgap/core/src/models/dataset/Dataset";
import type {
    HostedDatasetFileMetadata,
    HostedDatasetManifest,
} from "@draftgap/core/src/models/dataset/HostedDataset";
import type { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import { defaultChampionRoleData } from "@draftgap/core/src/models/dataset/ChampionRoleData";
import { ROLES } from "@draftgap/core/src/models/Role";
import {
    datasetPairMatchesManifest,
    isDatasetShape,
    parseHostedDatasetManifest,
    validateHostedDataset,
} from "./hosted-dataset";

const DATE = "2026-08-08T12:17:00.000Z";

function createDataset(version: string): Dataset {
    const statsByRole = Object.fromEntries(
        ROLES.map((role) => {
            const roleData = defaultChampionRoleData();
            roleData.statsByTime = [{ games: 100, wins: 50 }];
            return [role, roleData];
        }),
    ) as ChampionData["statsByRole"];

    return {
        version,
        date: DATE,
        timeBuckets: [
            {
                start: 0,
                end: null,
                gameShare: 1,
                sourceBucketStart: 0,
                sourceBucketEnd: 6,
            },
        ],
        championData: {
            "1": {
                id: "Annie",
                key: "1",
                name: "Annie",
                i18n: {},
                statsByRole,
            },
        },
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };
}

async function createMetadata<Name extends HostedDatasetFileMetadata["name"]>(
    name: Name,
    dataset: Dataset,
) {
    const contents = JSON.stringify(dataset);
    const encoded = new TextEncoder().encode(contents);
    const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoded),
    );
    const sha256 = Array.from(digest, (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");

    return {
        contents,
        metadata: {
            name,
            version: dataset.version,
            date: dataset.date,
            bytes: encoded.byteLength,
            sha256,
            championCount: 1,
        } satisfies HostedDatasetFileMetadata<Name>,
    };
}

async function createFixture() {
    const currentPatch = await createMetadata(
        "current-patch.json",
        createDataset("26.16.1"),
    );
    const thirtyDays = await createMetadata(
        "30-days.json",
        createDataset("30"),
    );
    const manifest: HostedDatasetManifest = {
        formatVersion: 1,
        datasetVersion: DATASET_VERSION,
        tier: "gold_plus",
        generationId: "12345-1",
        generatedAt: DATE,
        files: {
            currentPatch: currentPatch.metadata,
            thirtyDays: thirtyDays.metadata,
        },
    };

    return { currentPatch, thirtyDays, manifest };
}

describe("hosted dataset validation", () => {
    it("accepts a compatible manifest and verified pair", async () => {
        const fixture = await createFixture();
        const manifest = parseHostedDatasetManifest(
            JSON.stringify(fixture.manifest),
            "gold_plus",
        );
        const currentPatch = await validateHostedDataset(
            fixture.currentPatch.contents,
            manifest.files.currentPatch,
        );
        const thirtyDays = await validateHostedDataset(
            fixture.thirtyDays.contents,
            manifest.files.thirtyDays,
        );

        expect(
            datasetPairMatchesManifest({ currentPatch, thirtyDays }, manifest),
        ).toBe(true);
    });

    it("rejects a manifest for another tier", async () => {
        const { manifest } = await createFixture();

        expect(() =>
            parseHostedDatasetManifest(JSON.stringify(manifest), "diamond"),
        ).toThrow("incompatible");
    });

    it("rejects changed dataset contents", async () => {
        const { currentPatch } = await createFixture();

        await expect(
            validateHostedDataset(
                `${currentPatch.contents} `,
                currentPatch.metadata,
            ),
        ).rejects.toThrow("unexpected size");
    });

    it("rejects adaptive time buckets whose labels do not match the source ranges", () => {
        const dataset = createDataset("30");
        dataset.timeBuckets[0]!.end = 35;

        expect(isDatasetShape(dataset)).toBe(false);
    });

    it("rejects champion time stats that do not match the adaptive buckets", () => {
        const dataset = createDataset("30");
        dataset.championData["1"]!.statsByRole[0].statsByTime = [];

        expect(isDatasetShape(dataset)).toBe(false);
    });
});
