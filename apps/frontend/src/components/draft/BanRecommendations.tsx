import { displayNameByRole } from "@draftgap/core/src/models/Role";
import { For, Show } from "solid-js";
import { useDataset } from "../../contexts/DatasetContext";
import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { useDraftSuggestions } from "../../contexts/DraftSuggestionsContext";
import { useLolClient } from "../../contexts/LolClientContext";
import { useUser } from "../../contexts/UserContext";
import { championName } from "../../utils/i18n";
import { formatPercentage } from "../../utils/rating";
import { ChampionIcon } from "../icons/ChampionIcon";
import { RoleIcon } from "../icons/roles/RoleIcon";

const MAX_RECOMMENDATIONS = 5;

export function BanRecommendations() {
    const { dataset } = useDataset();
    const { config } = useUser();
    const { isBanPhase } = useLolClient();
    const { allyTeamCompWithHovers } = useDraftAnalysis();
    const { banSuggestions } = useDraftSuggestions();

    const recommendations = () =>
        banSuggestions().slice(0, MAX_RECOMMENDATIONS);

    return (
        <Show when={isBanPhase()}>
            <section class="mb-4 shrink-0 rounded-md border border-red-950 bg-primary p-3">
                <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div class="flex items-baseline gap-3">
                        <h2 class="text-lg font-semibold uppercase text-red-400">
                            Recommended bans
                        </h2>
                        <span class="text-sm uppercase text-neutral-500">
                            Based on {allyTeamCompWithHovers().size} allied
                            intent
                            {allyTeamCompWithHovers().size === 1 ? "" : "s"}
                        </span>
                    </div>
                    <span class="text-xs uppercase text-neutral-500">
                        Highest estimated enemy winrate versus your team
                    </span>
                </div>

                <Show
                    when={allyTeamCompWithHovers().size > 0}
                    fallback={
                        <p class="py-2 text-sm uppercase text-neutral-400">
                            Hover a champion in the League client to generate
                            team-aware ban recommendations.
                        </p>
                    }
                >
                    <Show
                        when={recommendations().length > 0}
                        fallback={
                            <p class="py-2 text-sm uppercase text-neutral-400">
                                No eligible recommendations meet your current
                                minimum-games filter.
                            </p>
                        }
                    >
                        <div class="flex gap-2 overflow-x-auto pb-1">
                            <For each={recommendations()}>
                                {(suggestion, index) => {
                                    const champion = () =>
                                        dataset()!.championData[
                                            suggestion.championKey
                                        ];

                                    return (
                                        <div
                                            class="flex min-w-48 flex-1 items-center gap-3 rounded-sm border border-neutral-700 bg-[#101010] p-2"
                                            title={`${formatPercentage(
                                                suggestion.draftResult.winrate,
                                            )}% estimated enemy winrate if ${championName(
                                                champion(),
                                                config,
                                            )} is picked into your current team`}
                                        >
                                            <span class="w-4 shrink-0 text-center text-sm font-semibold text-neutral-500">
                                                {index() + 1}
                                            </span>
                                            <ChampionIcon
                                                championKey={
                                                    suggestion.championKey
                                                }
                                                size={40}
                                                class="shrink-0"
                                            />
                                            <div class="min-w-0 flex-1">
                                                <div class="truncate uppercase">
                                                    {championName(
                                                        champion(),
                                                        config,
                                                    )}
                                                </div>
                                                <div class="flex items-center gap-1 text-xs uppercase text-neutral-500">
                                                    <RoleIcon
                                                        role={suggestion.role}
                                                        class="h-4 w-4"
                                                    />
                                                    <span>
                                                        {
                                                            displayNameByRole[
                                                                suggestion.role
                                                            ]
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                            <div class="shrink-0 text-right">
                                                <div class="font-semibold tabular-nums text-red-400">
                                                    {formatPercentage(
                                                        suggestion.draftResult
                                                            .winrate,
                                                    )}
                                                    %
                                                </div>
                                                <div class="text-[0.65rem] uppercase text-neutral-600">
                                                    Enemy WR
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </Show>
                </Show>
            </section>
        </Show>
    );
}
