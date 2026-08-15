import { createSignal, Show } from "solid-js";
import { ButtonGroup } from "../../common/ButtonGroup";
import { DuoResultTable } from "./DuoResultTable";
import { IndividualChampionsResultTable } from "./IndividualChampionsResultTable";
import { MatchupResultTable } from "./MatchupResultTable";
import { DraftSummaryCards } from "./SummaryCards";
import { TotalChampionContributionTable } from "./TotalChampionContributionTable";
import { tooltip } from "../../../directives/tooltip";
import { Team } from "@draftgap/core/src/models/Team";
import { useUser } from "../../../contexts/UserContext";
import { useDraftAnalysis } from "../../../contexts/DraftAnalysisContext";
import { ScalingChart } from "./ScalingChart";
// eslint-disable-next-line
tooltip;

export default function AnalysisView() {
    const { config } = useUser();
    const { setAnalysisPick } = useDraftAnalysis();
    const [showAllMatchups, setShowAllMatchups] = createSignal(false);

    const openChampionDraftAnalysisModal = (
        team: Team,
        championKey: string,
    ) => {
        setAnalysisPick({ team, championKey });
    };

    return (
        <div>
            <section aria-labelledby="ally-summary-title">
                <h2
                    id="ally-summary-title"
                    class="mb-2 ml-4 text-xl font-semibold uppercase text-ally"
                >
                    Ally
                </h2>
                <DraftSummaryCards team="ally" />
            </section>
            <section
                aria-labelledby="opponent-summary-title"
                class="mb-12 mt-6"
            >
                <h2
                    id="opponent-summary-title"
                    class="mb-2 ml-4 text-xl font-semibold uppercase text-opponent"
                >
                    Opponent
                </h2>
                <DraftSummaryCards team="opponent" />
            </section>

            <div
                class="flex flex-col gap-8 mb-8 overflow-hidden min-[2100px]:flex-row"
                id="total-result"
            >
                <div class="min-w-0 min-[2100px]:w-1/2">
                    <h3
                        class="text-3xl mb-1 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    How much does every champion contribute to
                                    the draft in which aspect?
                                    <br />
                                    <br />
                                    <strong>BASE</strong>: Champion base winrate
                                    <br />
                                    <strong>MATCHUP</strong>: Total winrate of
                                    all champion matchups
                                    <br />
                                    <strong>DUO</strong>: Total winrate of all
                                    champion duos
                                    <br />
                                    <strong>TOTAL</strong>: Total contribution
                                    of champion (BASE + MATCHUP + DUO)
                                </>
                            ),
                        }}
                    >
                        Ally overview
                    </h3>
                    <TotalChampionContributionTable
                        team="ally"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("ally", key)
                        }
                    />
                </div>
                <div class="min-w-0 min-[2100px]:w-1/2">
                    <h3
                        class="text-3xl mb-1 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    How much does every champion contribute to
                                    the draft in which aspect?
                                    <br />
                                    <br />
                                    <strong>BASE</strong>: Champion base winrate
                                    <br />
                                    <strong>MATCHUP</strong>: Total winrate of
                                    all champion matchups
                                    <br />
                                    <strong>DUO</strong>: Total winrate of all
                                    champion duos
                                    <br />
                                    <strong>TOTAL</strong>: Total contribution
                                    of champion (BASE + MATCHUP + DUO)
                                </>
                            ),
                        }}
                    >
                        Opponent overview
                    </h3>
                    <TotalChampionContributionTable
                        team="opponent"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("opponent", key)
                        }
                    />
                </div>
            </div>

            <Show when={!config.ignoreChampionWinrates}>
                <div
                    class="flex-col flex sm:flex-row gap-4 mb-8"
                    id="champions-result"
                >
                    <div class="sm:w-1/2">
                        <h3
                            class="text-3xl uppercase mb-1 ml-4"
                            // @ts-ignore
                            use:tooltip={{
                                content: (
                                    <>Base winrates of individual champions</>
                                ),
                            }}
                        >
                            Ally champions
                        </h3>
                        <IndividualChampionsResultTable
                            team="ally"
                            onClickChampion={(championKey) =>
                                openChampionDraftAnalysisModal(
                                    "ally",
                                    championKey,
                                )
                            }
                        />
                    </div>
                    <div class="sm:w-1/2">
                        <h3
                            class="text-3xl uppercase mb-1 ml-4"
                            // @ts-ignore
                            use:tooltip={{
                                content: (
                                    <>Base winrates of individual champions</>
                                ),
                            }}
                        >
                            Opponent champions
                        </h3>
                        <IndividualChampionsResultTable
                            team="opponent"
                            onClickChampion={(championKey) =>
                                openChampionDraftAnalysisModal(
                                    "opponent",
                                    championKey,
                                )
                            }
                        />
                    </div>
                </div>
            </Show>

            <div
                class="flex-col flex md:flex-row justify-between gap-2 md:items-end mb-2 items-end"
                id="matchup-result"
            >
                <div>
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    Winrates of all matchups between ally and
                                    opponent champions
                                </>
                            ),
                        }}
                    >
                        Matchups
                    </h3>
                    <p
                        class="text-neutral-400 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    The individual champion winrates have been
                                    normalized (removed) before calculating the
                                    matchup winrates to remove the current meta
                                    bias of the matchup.
                                </>
                            ),
                        }}
                    >
                        Champion winrates normalized
                    </p>
                </div>
                <ButtonGroup
                    options={[
                        { label: "HEAD 2 HEAD", value: false },
                        { label: "ALL", value: true },
                    ]}
                    size="sm"
                    selected={showAllMatchups()}
                    onChange={setShowAllMatchups}
                />
            </div>
            <MatchupResultTable
                class="w-full mb-8"
                showAll={showAllMatchups()}
                onClickChampion={(team, championKey) =>
                    openChampionDraftAnalysisModal(team, championKey)
                }
            />

            <div
                class="flex flex-col gap-8 mb-8 min-[2100px]:flex-row"
                id="duo-result"
            >
                <div class="min-w-0 min-[2100px]:w-1/2">
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>Winrates of all duos in the ally draft</>
                            ),
                        }}
                    >
                        Ally duos
                    </h3>
                    <p
                        class="text-neutral-400 uppercase ml-4 mb-2"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    The individual champion winrates have been
                                    normalized (removed) before calculating the
                                    duo winrates.
                                </>
                            ),
                        }}
                    >
                        Champion winrates normalized
                    </p>
                    <DuoResultTable
                        team="ally"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("ally", key)
                        }
                    />
                </div>
                <div class="min-w-0 min-[2100px]:w-1/2">
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>Winrates of all duos in the opponent draft</>
                            ),
                        }}
                    >
                        Opponent duos
                    </h3>
                    <p
                        class="text-neutral-400 uppercase ml-4 mb-2"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    The individual champion winrates have been
                                    normalized (removed) before calculating the
                                    duo winrates.
                                </>
                            ),
                        }}
                    >
                        Champion winrates normalized
                    </p>
                    <DuoResultTable
                        team="opponent"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("opponent", key)
                        }
                    />
                </div>
            </div>

            {/* <div class="mb-2 mt-16 flex justify-center items-center gap-2">
                <div class="h-[3px] bg-neutral-700 w-24" />

                <h2 class="text-4xl uppercase text-neutral-500 text-center">
                    Misc
                </h2>

                <div class="h-[3px] bg-neutral-700 w-24" />
            </div> */}

            <div>
                <div class="mb-2 flex items-center justify-between gap-4">
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    Relative winrate by final game duration. 50%
                                    means the selected champions perform as
                                    expected overall. Sparse adjacent time
                                    ranges may be combined. Each team is
                                    estimated independently; matchup effects
                                    between the drafts are not included.
                                </>
                            ),
                        }}
                    >
                        Scaling
                    </h3>
                    <div
                        class="flex items-center gap-4 text-sm font-semibold uppercase"
                        aria-label="Scaling chart legend"
                    >
                        <span class="flex items-center gap-2">
                            <span
                                class="h-1 w-6 rounded-full bg-ally"
                                aria-hidden="true"
                            />
                            Ally
                        </span>
                        <span class="flex items-center gap-2">
                            <span
                                class="h-1 w-6 rounded-full bg-opponent"
                                aria-hidden="true"
                            />
                            Opponent
                        </span>
                    </div>
                </div>
                <div class="p-4 rounded-md bg-primary w-full h-[26rem]">
                    <ScalingChart />
                </div>
            </div>
        </div>
    );
}
