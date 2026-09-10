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

const MAX_RECOMMENDATIONS = 10;

export function BanRecommendations() {
    const { dataset } = useDataset();
    const { config } = useUser();
    const { isBanPhase } = useLolClient();
    const { allyTeamCompWithHovers } = useDraftAnalysis();
    const { banSuggestions } = useDraftSuggestions();

    const recommendations = () =>
        banSuggestions().slice(0, MAX_RECOMMENDATIONS);

    function scrollRecommendations(
        event: WheelEvent & { currentTarget: HTMLDivElement },
    ) {
        const list = event.currentTarget;
        if (
            list.scrollWidth <= list.clientWidth ||
            Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ) {
            return;
        }

        const previousScrollLeft = list.scrollLeft;
        list.scrollLeft += event.deltaY;
        if (list.scrollLeft !== previousScrollLeft) event.preventDefault();
    }

    return (
        <Show when={isBanPhase()}>
            <section
                data-ban-recommendations
                aria-label="Recommended bans"
                class="mb-4 shrink-0 rounded-md border border-red-950 bg-primary p-3"
            >
                <div
                    data-ban-recommendations-header
                    class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                >
                    <div class="flex items-baseline gap-3">
                        <h2 class="text-lg font-semibold uppercase text-red-400">
                            Recommended bans
                        </h2>
                        <Show when={allyTeamCompWithHovers().size > 0}>
                            <span
                                data-ban-recommendations-detail
                                class="text-sm uppercase text-neutral-400"
                            >
                                Based on {allyTeamCompWithHovers().size} allied
                                intent
                                {allyTeamCompWithHovers().size === 1 ? "" : "s"}
                            </span>
                        </Show>
                    </div>
                    <span
                        data-ban-recommendations-detail
                        class="text-xs uppercase text-neutral-400"
                    >
                        Sorted by enemy winrate · Pick is 30-day role pick rate
                    </span>
                </div>

                <Show
                    when={allyTeamCompWithHovers().size > 0}
                    fallback={
                        <p class="py-2 text-sm text-neutral-300">
                            No allied intent yet — use the champion table below,
                            ranked by winrate with pick rate shown during bans.
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
                        <div
                            data-ban-recommendations-list
                            role="list"
                            aria-label="Ban recommendations sorted by estimated enemy winrate"
                            tabindex="0"
                            class="flex gap-2 overflow-x-auto pb-1"
                            onWheel={scrollRecommendations}
                        >
                            <For each={recommendations()}>
                                {(suggestion, index) => {
                                    const champion = () =>
                                        dataset()!.championData[
                                            suggestion.championKey
                                        ];

                                    return (
                                        <article
                                            data-ban-recommendation-card
                                            role="listitem"
                                            class="grid w-64 shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-neutral-700 bg-[#101010] p-2"
                                            title={`${formatPercentage(
                                                suggestion.draftResult.winrate,
                                            )}% estimated enemy winrate if ${championName(
                                                champion(),
                                                config,
                                            )} is picked into your current team; ${formatPercentage(
                                                suggestion.pickRate,
                                            )}% pick rate in ${displayNameByRole[
                                                suggestion.role
                                            ].toLowerCase()} over the last 30 days`}
                                        >
                                            <span class="w-4 shrink-0 text-center text-sm font-semibold text-neutral-400">
                                                {index() + 1}
                                            </span>
                                            <ChampionIcon
                                                data-ban-recommendation-icon
                                                championKey={
                                                    suggestion.championKey
                                                }
                                                size={40}
                                                class="shrink-0"
                                            />
                                            <div class="min-w-0 flex-1">
                                                <div
                                                    data-ban-recommendation-name
                                                    class="whitespace-normal break-words uppercase leading-tight"
                                                >
                                                    {championName(
                                                        champion(),
                                                        config,
                                                    )}
                                                </div>
                                                <div
                                                    data-ban-recommendation-secondary
                                                    class="flex items-center gap-1 text-xs uppercase text-neutral-400"
                                                >
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
                                            <div
                                                data-ban-recommendation-metrics
                                                class="shrink-0 text-right text-xs leading-tight"
                                            >
                                                <div class="whitespace-nowrap font-semibold tabular-nums text-red-400">
                                                    {formatPercentage(
                                                        suggestion.draftResult
                                                            .winrate,
                                                    )}
                                                    % WR
                                                </div>
                                                <div class="whitespace-nowrap tabular-nums text-neutral-300">
                                                    {formatPercentage(
                                                        suggestion.pickRate,
                                                    )}
                                                    % PICK
                                                </div>
                                            </div>
                                        </article>
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
