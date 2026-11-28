// Called by actions/github-script. The upload step supplies the exact artifact
// ID; no artifact client or third-party URL parser is needed to publish it.
module.exports = async function deploy(
    { github, context, core },
    artifact,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
    const artifactId = Number(artifact);
    if (!Number.isSafeInteger(artifactId) || artifactId < 1) {
        throw new Error("Missing or invalid Pages artifact ID");
    }
    const route = "/repos/{owner}/{repo}/pages/deployments";
    const repo = { ...context.repo, request: { timeout: 20000 } };
    const { data } = await github.request(`POST ${route}`, {
        ...repo,
        artifact_id: artifactId,
        pages_build_version: context.sha,
        oidc_token: await core.getIDToken(),
    });
    if (!data.id) throw new Error("Pages returned no deployment ID");
    const params = { ...repo, deploymentId: data.id };
    const cancel = () =>
        github.request(`POST ${route}/{deploymentId}/cancel`, params);
    const onInterrupt = () => cancel().finally(() => process.exit(1));
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onInterrupt);
    let pending = true;
    try {
        const deadline = Date.now() + 10 * 60 * 1000;
        while (Date.now() < deadline) {
            await sleep(5000);
            let status;
            try {
                ({
                    data: { status },
                } = await github.request(
                    `GET ${route}/{deploymentId}`,
                    params,
                ));
            } catch (error) {
                if (
                    error.status !== 404 &&
                    error.status !== 429 &&
                    !(error.status >= 500)
                )
                    throw error;
                core.warning(
                    `Pages status temporarily unavailable (HTTP ${error.status})`,
                );
                continue;
            }
            core.info(`Pages status: ${status}`);
            if (status === "succeed") {
                pending = false;
                core.setOutput("page_url", data.page_url);
                return;
            }
            if (
                [
                    "deployment_failed",
                    "deployment_content_failed",
                    "deployment_cancelled",
                    "deployment_lost",
                ].includes(status)
            ) {
                pending = false;
                throw new Error(`Pages deployment ended: ${status}`);
            }
        }
        throw new Error("Timed out waiting for GitHub Pages");
    } finally {
        process.removeListener("SIGINT", onInterrupt);
        process.removeListener("SIGTERM", onInterrupt);
        if (pending)
            await cancel().catch((err) =>
                core.warning(
                    `Could not cancel Pages deployment: ${err.message}`,
                ),
            );
    }
};
