import { Show, createSignal } from "solid-js";
import {
    DEFAULT_DATA_TIER,
    displayNameByDataTier,
} from "@draftgap/core/src/models/dataset/DataTier";
import { useDataset } from "../../contexts/DatasetContext";
import { Button } from "../common/Button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../common/Dialog";

export function LocalDatasetUpdateDialog() {
    const { localDatasetUpdate, refreshLocalDatasets } = useDataset();
    const [dismissedUpdate, setDismissedUpdate] = createSignal<string>();

    const updateKey = () => {
        const update = localDatasetUpdate();
        if (!update) return undefined;

        return [update.tier, update.cachedVersion, update.generationId].join(
            ":",
        );
    };
    const isOpen = () => {
        const key = updateKey();
        return key !== undefined && dismissedUpdate() !== key;
    };
    const dismiss = () => setDismissedUpdate(updateKey());
    const downloadUpdate = () => {
        dismiss();
        void refreshLocalDatasets();
    };

    return (
        <Dialog
            open={isOpen()}
            onOpenChange={(open) => {
                if (!open) dismiss();
            }}
        >
            <DialogContent canClose={false}>
                <DialogHeader>
                    <DialogTitle>Dataset update available</DialogTitle>
                </DialogHeader>
                <p class="text-xl uppercase text-neutral-300">
                    Your{" "}
                    {
                        displayNameByDataTier[
                            localDatasetUpdate()?.tier ?? DEFAULT_DATA_TIER
                        ]
                    }{" "}
                    data has a newer published update.
                </p>
                <div class="space-y-2 text-neutral-300">
                    <Show when={localDatasetUpdate()?.patchOutdated}>
                        <p>
                            A new dataset is ready: current patch{" "}
                            {localDatasetUpdate()?.cachedVersion}, available
                            patch {localDatasetUpdate()?.availableVersion}.
                        </p>
                    </Show>
                    <Show when={localDatasetUpdate()?.waitingForPatch}>
                        <p>
                            Data for League patch{" "}
                            {localDatasetUpdate()?.currentVersion} is still
                            being prepared. This download refreshes the
                            available data.
                        </p>
                    </Show>
                    <Show when={localDatasetUpdate()?.thirtyDaysStale}>
                        <p>
                            {localDatasetUpdate()?.thirtyDaysAgeDays ===
                            undefined
                                ? "The age of the 30-day dataset could not be determined."
                                : `The 30-day dataset was generated ${localDatasetUpdate()?.thirtyDaysAgeDays} days ago.`}
                        </p>
                    </Show>
                    <p class="text-sm text-neutral-400">
                        DraftGap will check your daily GitHub dataset and
                        download it when a newer copy is available. Your last
                        complete cache stays available if the download fails.
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={dismiss}>
                        Later
                    </Button>
                    <Button variant="primary" onClick={downloadUpdate}>
                        Download update
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
