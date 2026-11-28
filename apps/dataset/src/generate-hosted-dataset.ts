import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
    DataTiers,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";
import {
    DATASET_VERSION,
    type Dataset,
} from "@draftgap/core/src/models/dataset/Dataset";
import {
    HOSTED_DATASET_FORMAT_VERSION,
    type HostedDatasetFileMetadata,
    type HostedDatasetManifest,
} from "@draftgap/core/src/models/dataset/HostedDataset";
import { generateDatasets } from "./index";

const CURRENT_PATCH_FILE_NAME = "current-patch.json" as const;
const THIRTY_DAYS_FILE_NAME = "30-days.json" as const;

function parseArguments() {
    const [tierArgument, outputRoot = ".hosted-dataset"] = Bun.argv.slice(2);

    if (!tierArgument || !DataTiers.includes(tierArgument as DataTier)) {
        throw new Error(
            `Expected a data tier (${DataTiers.join(", ")}) as the first argument`,
        );
    }

    return {
        tier: tierArgument as DataTier,
        outputRoot,
    };
}

function serializeDataset<Name extends HostedDatasetFileMetadata["name"]>(
    dataset: Dataset,
    name: Name,
) {
    const contents = JSON.stringify(dataset);
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(contents);

    return {
        contents,
        metadata: {
            name,
            version: dataset.version,
            date: dataset.date,
            bytes: Buffer.byteLength(contents, "utf8"),
            sha256: hasher.digest("hex"),
            championCount: Object.keys(dataset.championData).length,
        } satisfies HostedDatasetFileMetadata<Name>,
    };
}

async function main() {
    const { tier, outputRoot } = parseArguments();
    const generationId = crypto.randomUUID();
    const outputDirectory = join(outputRoot, `v${DATASET_VERSION}`, tier);

    console.log(`Generating hosted ${tier} datasets (${generationId})`);
    const { currentPatch, thirtyDays } = await generateDatasets(tier, {
        onProgress: ({ dataset, completedChampions, totalChampions }) =>
            console.log(
                `[${tier}/${dataset}] ${completedChampions}/${totalChampions}`,
            ),
    });

    const currentPatchFile = serializeDataset(
        currentPatch,
        CURRENT_PATCH_FILE_NAME,
    );
    const thirtyDaysFile = serializeDataset(thirtyDays, THIRTY_DAYS_FILE_NAME);
    const manifest = {
        formatVersion: HOSTED_DATASET_FORMAT_VERSION,
        datasetVersion: DATASET_VERSION,
        tier,
        generationId,
        generatedAt: new Date().toISOString(),
        files: {
            currentPatch: currentPatchFile.metadata,
            thirtyDays: thirtyDaysFile.metadata,
        },
    } satisfies HostedDatasetManifest;

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
        Bun.write(
            join(outputDirectory, CURRENT_PATCH_FILE_NAME),
            currentPatchFile.contents,
        ),
        Bun.write(
            join(outputDirectory, THIRTY_DAYS_FILE_NAME),
            thirtyDaysFile.contents,
        ),
    ]);

    // Publish the manifest after both immutable members of the generation exist.
    await Bun.write(
        join(outputDirectory, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );

    console.log(`Hosted ${tier} datasets written to ${outputDirectory}`);
}

await main();
