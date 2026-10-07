import type { DataTier } from "@draftgap/core/src/models/dataset/DataTier";
import { DatasetHttpError } from "../fetch";
import { getLolalyticsQwikChampion, type QwikLolalyticsData } from "./qwik";

function hasBuildData(data: QwikLolalyticsData) {
    return (
        Number.isFinite(data.header?.n) && data.header.n > 0 && !!data.skill6
    );
}

export async function getAvailableRiotVersion(
    versions: readonly string[],
    tier: DataTier,
    fetchChampion = getLolalyticsQwikChampion,
) {
    const latestVersion = versions[0];
    if (!latestVersion) throw new Error("Riot returned no patch versions");

    const latestPatch = latestVersion.split(".").slice(0, 2).join(".");
    try {
        const latestData = await fetchChampion(
            latestVersion,
            "Ahri",
            undefined,
            undefined,
            undefined,
            tier,
        );
        if (
            hasBuildData(latestData) &&
            latestData.header.patch === latestPatch
        ) {
            return latestVersion;
        }
    } catch (error) {
        // Network errors and rate limits must still fail rather than being
        // mistaken for a patch that has not been published yet.
        if (!(error instanceof DatasetHttpError) || error.status !== 404) {
            throw error;
        }
    }

    // Omitting patch selects Lolalytics' current default, which may lag Riot
    // around patch release. Pin every subsequent request to this exact patch.
    const defaultData = await fetchChampion(
        undefined,
        "Ahri",
        undefined,
        undefined,
        undefined,
        tier,
    );
    const availablePatch = defaultData.header?.patch;
    if (
        !hasBuildData(defaultData) ||
        !/^\d+\.\d+$/.test(availablePatch ?? "")
    ) {
        throw new Error("Lolalytics has no usable current-patch data");
    }

    const availableVersion = versions.find(
        (version) =>
            version.split(".").slice(0, 2).join(".") === availablePatch,
    );
    if (!availableVersion) {
        throw new Error(
            `Lolalytics patch ${availablePatch} has no matching Riot assets`,
        );
    }

    console.log(
        `Lolalytics ${latestPatch} is not ready for ${tier}; using ${availablePatch} (${availableVersion}). The 30-day dataset will still be refreshed.`,
    );
    return availableVersion;
}
