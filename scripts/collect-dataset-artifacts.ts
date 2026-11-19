import { $ } from "bun";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DataTiers } from "../packages/core/src/models/dataset/DataTier";
import { DATASET_VERSION } from "../packages/core/src/models/dataset/Dataset";

type Artifact = { name: string; id: number; digest: string; expired: boolean };

export function selectTierArtifacts(artifacts: Artifact[]) {
    return DataTiers.map((tier) => {
        const matches = artifacts.filter(
            (a) => a.name === `rank-dataset-${tier}` && !a.expired,
        );
        if (
            matches.length !== 1 ||
            !/^sha256:[a-f0-9]{64}$/.test(matches[0].digest)
        ) {
            throw new Error(
                `Expected one unexpired artifact with a digest for ${tier}`,
            );
        }
        return { tier, ...matches[0] };
    });
}

export function verifyArchive(bytes: ArrayBuffer, expected: string) {
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (`sha256:${hash}` !== expected)
        throw new Error("Artifact SHA-256 mismatch");
}

if (import.meta.main) {
    const { GITHUB_REPOSITORY, GITHUB_RUN_ID, RUNNER_TEMP } = process.env;
    if (!GITHUB_REPOSITORY || !GITHUB_RUN_ID || !RUNNER_TEMP) {
        throw new Error("Missing Actions run context");
    }
    const api = `repos/${GITHUB_REPOSITORY}/actions`;
    const endpoint = `${api}/runs/${GITHUB_RUN_ID}/artifacts?per_page=100`;
    const list = await $`gh api ${endpoint}`.json();
    for (const { tier, id, digest } of selectTierArtifacts(list.artifacts)) {
        const archive = join(RUNNER_TEMP, `rank-${tier}.zip`);
        const endpoint = `${api}/artifacts/${id}/zip`;
        await $`gh api ${endpoint} > ${archive}`;
        verifyArchive(await Bun.file(archive).arrayBuffer(), digest);

        // Extract only the three files the app reads, never archive-supplied paths.
        const prefix = `v${DATASET_VERSION}/${tier}`;
        await mkdir(join("_site", prefix), { recursive: true });
        for (const file of [
            "manifest.json",
            "current-patch.json",
            "30-days.json",
        ]) {
            const member = `${prefix}/${file}`;
            await $`unzip -p ${archive} ${member} > ${join("_site", member)}`;
        }
        console.log(`Verified and staged ${tier}`);
    }
}
