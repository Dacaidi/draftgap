import { Icon } from "solid-heroicons";
import {
    Component,
    createEffect,
    createSignal,
    For,
    Match,
    Show,
    Switch,
} from "solid-js";
import DraftTable from "./components/draft/DraftTable";
import { RoleFilter } from "./components/draft/RoleFilter";
import { Search } from "./components/draft/Search";
import { TeamSelector } from "./components/draft/TeamSelector";
import { TeamSidebar } from "./components/draft/TeamSidebar";
import { cog_6Tooth } from "solid-heroicons/solid";
import AnalysisView from "./components/views/analysis/AnalysisView";
import { LolClientStatusBadge } from "./components/draft/LolClientStatusBadge";
import { useLolClient } from "./contexts/LolClientContext";
import { Badge } from "./components/common/Badge";
import { FilterMenu } from "./components/draft/FilterMenu";
import { formatDistance } from "date-fns";
import { ViewTabs } from "./components/common/ViewTabs";
import { BuildsView } from "./components/views/builds/BuildsView";
import { useDraftView } from "./contexts/DraftViewContext";
import { useUser } from "./contexts/UserContext";
import { useDataset } from "./contexts/DatasetContext";
import { LoadingIcon } from "./components/icons/LoadingIcon";
import { DialogTrigger, Dialog } from "./components/common/Dialog";
import SettingsDialog from "./components/dialogs/SettingsDialog";
import { FAQDialog } from "./components/dialogs/FAQDialog";
import { DesktopAppDialog } from "./components/dialogs/DesktopAppDialog";
import { OptionsDropdownMenu } from "./components/OptionsMenu";
import { useDraftAnalysis } from "./contexts/DraftAnalysisContext";
import { ChampionDraftAnalysisDialog } from "./components/dialogs/ChampionDraftAnalysisDialog";
import { AnalyzeHoverToggle } from "./components/draft/AnalyzeHoverToggle";
import { useMedia } from "./hooks/useMedia";
import { buttonVariants } from "./components/common/Button";
import { cn } from "./utils/style";
import { LanguageDropdownMenu } from "./components/LanguageMenu";
import { LocalDatasetUpdateDialog } from "./components/dialogs/LocalDatasetUpdateDialog";
import { BanRecommendations } from "./components/draft/BanRecommendations";

const App: Component = () => {
    const { config } = useUser();
    const { currentDraftView, setCurrentDraftView } = useDraftView();
    const {
        dataset,
        isLoaded,
        datasetState,
        datasetError,
        generationProgress,
        hostedDatasetStatus,
    } = useDataset();
    const { analysisPick, setAnalysisPick, showAnalysisPick } =
        useDraftAnalysis();
    const { startLolClientIntegration, stopLolClientIntegration } =
        useLolClient();
    const { isDesktop, isMobileLayout } = useMedia();

    createEffect(() => {
        if (config.disableLeagueClientIntegration) {
            stopLolClientIntegration();
        } else {
            startLolClientIntegration();
        }
    });

    const [showSettings, setShowSettings] = createSignal(false);
    const [showFAQ, setShowFAQ] = createSignal(false);
    const [showDownloadModal, setShowDownloadModal] = createSignal(false);
    let wasMobileLayout = isMobileLayout();

    createEffect(() => {
        const mobileLayout = isMobileLayout();
        if (mobileLayout && !wasMobileLayout) {
            const view = currentDraftView();
            if (view.type === "draft") {
                setCurrentDraftView({ type: "draft", subType: "draft" });
            }
        }
        wasMobileLayout = mobileLayout;
    });

    const timeAgo = () =>
        dataset()
            ? formatDistance(new Date(dataset()!.date), new Date(), {
                  addSuffix: true,
              })
            : "";

    const MainView = () => {
        return (
            <div class="bg-[#101010] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <Switch>
                    <Match when={datasetState() === "errored"}>
                        <div class="flex flex-col justify-center items-center h-full text-2xl text-red-500 px-8 text-center">
                            <span>Could not load the selected dataset.</span>
                            <span class="text-sm mt-2 text-neutral-400 normal-case">
                                {String(datasetError() ?? "Unknown error")}
                            </span>
                        </div>
                    </Match>
                    <Match when={!isLoaded()}>
                        <div class="flex flex-col gap-3 justify-center items-center h-full text-2xl">
                            <LoadingIcon class="animate-spin h-10 w-10" />
                            <Show when={hostedDatasetStatus()}>
                                {(status) => (
                                    <div class="text-center uppercase">
                                        {status() === "checking"
                                            ? "Checking daily hosted data"
                                            : `Downloading ${config.dataTier.replace("_plus", "+")} data from GitHub`}
                                    </div>
                                )}
                            </Show>
                            <Show when={generationProgress()}>
                                {(progress) => (
                                    <div class="text-center">
                                        <div class="uppercase">
                                            Building local{" "}
                                            {config.dataTier.replace(
                                                "_plus",
                                                "+",
                                            )}{" "}
                                            data
                                        </div>
                                        <div class="text-base text-neutral-400 mt-1">
                                            {progress().dataset ===
                                            "current-patch"
                                                ? "Current patch"
                                                : "Last 30 days"}
                                            : {progress().completedChampions}/
                                            {progress().totalChampions}{" "}
                                            champions
                                        </div>
                                    </div>
                                )}
                            </Show>
                        </div>
                    </Match>
                    <Match when={isLoaded()}>
                        <div class="flex min-h-0 flex-1 flex-col">
                            <ViewTabs
                                tabs={
                                    [
                                        {
                                            label: "Draft",
                                            value: "draft",
                                        },
                                        {
                                            label: "Draft Analysis",
                                            value: "analysis",
                                        },
                                        ...(config.enableBetaFeatures
                                            ? ([
                                                  {
                                                      label: "Builds",
                                                      value: "builds",
                                                  },
                                              ] as const)
                                            : []),
                                    ] as const
                                }
                                selected={currentDraftView().type}
                                onChange={(type) =>
                                    setCurrentDraftView({
                                        type,
                                        subType: "draft",
                                    })
                                }
                                class="shrink-0 xl:px-8"
                            />
                            <Switch>
                                <Match
                                    when={currentDraftView().type == "draft"}
                                >
                                    <div
                                        class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 xl:px-8"
                                        data-draft-view
                                    >
                                        <div class="mb-4 flex gap-4">
                                            <Search />
                                            <TeamSelector />
                                            <RoleFilter class="hidden xl:inline-flex" />
                                            <div class="hidden xl:inline-flex gap-3">
                                                <FilterMenu />
                                                <Show when={isDesktop}>
                                                    <AnalyzeHoverToggle />
                                                </Show>
                                            </div>
                                        </div>
                                        <div class="flex justify-end mb-4 gap-4 xl:hidden">
                                            <RoleFilter class="w-full" />
                                            <FilterMenu />
                                            <Show when={isDesktop}>
                                                <AnalyzeHoverToggle />
                                            </Show>
                                        </div>
                                        <BanRecommendations />
                                        <DraftTable />
                                    </div>
                                </Match>
                                <Match
                                    when={
                                        currentDraftView().type === "analysis"
                                    }
                                >
                                    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 xl:px-8">
                                        <AnalysisView />
                                    </div>
                                </Match>
                                <Match
                                    when={currentDraftView().type === "builds"}
                                >
                                    <BuildsView />
                                </Match>
                            </Switch>
                        </div>
                    </Match>
                </Switch>
            </div>
        );
    };

    const mobileTab = () => {
        const current = currentDraftView();
        if (current.type === "draft") {
            return current.subType;
        }
        return undefined;
    };

    return (
        <div
            class="flex h-screen min-h-0 flex-col overflow-hidden"
            style={{
                height: "calc(var(--vh, 1vh) * 100)",
            }}
        >
            <LocalDatasetUpdateDialog />
            <Show when={isLoaded() ? analysisPick() : undefined}>
                {(pick) => (
                    <Dialog
                        open={showAnalysisPick()}
                        onOpenChange={(open) => {
                            if (!open) setAnalysisPick(undefined);
                        }}
                    >
                        <ChampionDraftAnalysisDialog
                            championKey={pick().championKey}
                            team={pick().team}
                            openChampionDraftAnalysisModal={(
                                team,
                                championKey,
                            ) => setAnalysisPick({ team, championKey })}
                        />
                    </Dialog>
                )}
            </Show>
            <Dialog open={showFAQ()} onOpenChange={setShowFAQ}>
                <FAQDialog />
            </Dialog>
            <header class="bg-primary flex shrink-0 justify-between border-b-2 border-neutral-700 px-1 py-0">
                <h1 class="text-4xl sm:text-5xl mr-2 ml-1 mt-1 mb-[0.4rem] font-semibold tracking-wide">
                    DRAFTGAP
                </h1>
                <div class="flex items-center gap-4">
                    <Show when={dataset()}>
                        <div class="text-xs text-neutral-400 hidden md:flex flex-col text-right uppercase">
                            <span>Patch {dataset()!.version}</span>
                            <span>Last updated {timeAgo()}</span>
                        </div>
                    </Show>
                    <Dialog
                        open={showDownloadModal()}
                        onOpenChange={setShowDownloadModal}
                    >
                        <DesktopAppDialog open={showDownloadModal()} />
                    </Dialog>
                    <LolClientStatusBadge
                        setShowDownloadModal={setShowDownloadModal}
                    />
                    <div class="flex gap-1">
                        <LanguageDropdownMenu />
                        <Dialog
                            open={showSettings()}
                            onOpenChange={setShowSettings}
                        >
                            <DialogTrigger
                                type="button"
                                aria-label="Open settings"
                                class={cn(
                                    buttonVariants({
                                        variant: "transparent",
                                    }),
                                    "size-11 justify-center p-0",
                                )}
                            >
                                <Icon
                                    path={cog_6Tooth}
                                    class="w-7"
                                    aria-hidden="true"
                                />
                            </DialogTrigger>
                            <SettingsDialog />
                        </Dialog>
                        <OptionsDropdownMenu
                            setShowSettings={setShowSettings}
                            setShowFAQ={setShowFAQ}
                        />
                    </div>
                </div>
            </header>
            <Switch>
                <Match when={!isMobileLayout()}>
                    <main
                        class="grid min-h-0 min-w-0 flex-1 overflow-hidden"
                        style={{
                            "grid-template-columns":
                                "minmax(0, 1fr) minmax(0, 4fr) minmax(0, 1fr)",
                            "grid-template-rows": "minmax(0, 1fr)",
                        }}
                    >
                        <TeamSidebar team="ally" />

                        <MainView />

                        <TeamSidebar team="opponent" />
                    </main>
                </Match>
                <Match when={true}>
                    <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <Switch>
                            <Match when={mobileTab() === "ally"}>
                                <TeamSidebar team="ally" />
                            </Match>
                            <Match when={mobileTab() === "opponent"}>
                                <TeamSidebar team="opponent" />
                            </Match>
                            <Match when={true}>
                                <MainView />
                            </Match>
                        </Switch>
                    </main>

                    <Show when={mobileTab() !== undefined}>
                        <footer class="bg-primary flex shrink-0 justify-evenly gap-4 border-t-2 border-neutral-700 px-4 py-2">
                            <For
                                each={
                                    [
                                        { value: "ally", label: "Ally" },
                                        {
                                            value: "draft",
                                            label: "Champions",
                                        },
                                        {
                                            value: "opponent",
                                            label: "Opponent",
                                        },
                                    ] as const
                                }
                            >
                                {(view) => (
                                    <Badge
                                        as="button"
                                        type="button"
                                        aria-label={`Show ${view.label}`}
                                        aria-pressed={
                                            mobileTab() === view.value
                                        }
                                        onClick={() =>
                                            setCurrentDraftView({
                                                type: "draft",
                                                subType: view.value,
                                            })
                                        }
                                        theme={
                                            mobileTab() === view.value
                                                ? "primary"
                                                : "secondary"
                                        }
                                        class="w-1/3"
                                    >
                                        {view.label}
                                    </Badge>
                                )}
                            </For>
                        </footer>
                    </Show>
                </Match>
            </Switch>
        </div>
    );
};

export default App;
