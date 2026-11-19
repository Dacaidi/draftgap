import { describe, expect, mock, test } from "bun:test";
import { DataTiers } from "../packages/core/src/models/dataset/DataTier";
import {
    selectTierArtifacts,
    verifyArchive,
} from "./collect-dataset-artifacts";
import deploy from "./deploy-dataset-pages.cjs";

const bytes = new TextEncoder().encode("dataset").buffer;
const digest =
    "sha256:" + new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const artifacts = DataTiers.map((tier, i) => ({
    id: i + 1,
    name: `rank-dataset-${tier}`,
    digest,
    expired: false,
}));

describe("collect rank artifacts", () => {
    test("requires exactly one unexpired ZIP per supported tier, including on re-runs", () => {
        expect(
            selectTierArtifacts([
                ...artifacts,
                { ...artifacts[0], name: "github-pages-1" },
            ]).map((a) => a.tier),
        ).toEqual([...DataTiers]);
        expect(() => selectTierArtifacts(artifacts.slice(1))).toThrow();
        expect(() =>
            selectTierArtifacts([...artifacts, artifacts[0]]),
        ).toThrow();
        expect(() =>
            selectTierArtifacts([
                { ...artifacts[0], expired: true },
                ...artifacts.slice(1),
            ]),
        ).toThrow();
        expect(() =>
            selectTierArtifacts([
                { ...artifacts[0], digest: "" },
                ...artifacts.slice(1),
            ]),
        ).toThrow();
    });
    test("rejects modified archive bytes before extraction", () => {
        verifyArchive(bytes, digest);
        expect(() => verifyArchive(new ArrayBuffer(0), digest)).toThrow(
            "SHA-256",
        );
    });
});

function pages(...statuses: (string | number)[]) {
    const request = mock(async (route: string, _params: unknown) => {
        if (route.endsWith("/cancel")) return { data: {} };
        if (route.startsWith("POST"))
            return {
                data: { id: "deployment", page_url: "https://example.test" },
            };
        const status = statuses.shift();
        if (typeof status === "number")
            throw Object.assign(new Error("HTTP error"), { status });
        if (!status) throw new Error("Unexpected poll");
        return { data: { status } };
    });
    const core = {
        info: mock(),
        warning: mock(),
        setOutput: mock(),
        getIDToken: async () => "test-oidc",
    };
    const context = { repo: { owner: "owner", repo: "repo" }, sha: "sha" };
    return {
        request,
        core,
        publish: (id = "4321") =>
            deploy({ github: { request }, context, core }, id, async () => {}),
    };
}

describe("Pages deployment", () => {
    test("publishes the uploaded artifact with OIDC and waits for confirmed success", async () => {
        const { publish, request, core } = pages(503, "in_progress", "succeed");
        await publish();
        expect(request).toHaveBeenCalledTimes(4);
        expect(request.mock.calls[0][1]).toMatchObject({
            artifact_id: 4321,
            pages_build_version: "sha",
            oidc_token: "test-oidc",
        });
        expect(request.mock.calls[1][1]).toMatchObject({
            deploymentId: "deployment",
        });
        expect(core.setOutput).toHaveBeenCalledWith(
            "page_url",
            "https://example.test",
        );
    });
    test("fails without reporting a live URL on a terminal failure", async () => {
        const { publish, core, request } = pages("deployment_content_failed");
        await expect(publish()).rejects.toThrow("deployment_content_failed");
        expect(core.setOutput).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(2);
    });
    test("cancels a pending deployment when status can no longer be checked", async () => {
        const { publish, request } = pages(403);
        await expect(publish()).rejects.toThrow("HTTP error");
        expect(request.mock.calls.at(-1)?.[0]).toEndWith("/cancel");
    });
    test("never requests a deployment without the new artifact ID", async () => {
        const { publish, request } = pages();
        await expect(publish("")).rejects.toThrow("artifact ID");
        expect(request).not.toHaveBeenCalled();
    });
});
