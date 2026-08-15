import {
    CellContext,
    ColumnDef,
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
    Row,
    SortingState,
} from "@tanstack/solid-table";
import { useDraft } from "../../contexts/DraftContext";
import { displayNameByRole, Role } from "@draftgap/core/src/models/Role";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { getDirectMatchup } from "@draftgap/core/src/draft/direct-matchup";
import { Table } from "../common/Table";
import ChampionCell from "../common/ChampionCell";
import { RoleCell } from "../common/RoleCell";
import {
    batch,
    createMemo,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
} from "solid-js";
import { Icon } from "solid-heroicons";
import { star } from "solid-heroicons/solid";
import { star as starOutline } from "solid-heroicons/outline";
import { RatingText } from "../common/RatingText";
import { createMustSelectToast } from "../../utils/toast";
import { useUser } from "../../contexts/UserContext";
import { useDraftSuggestions } from "../../contexts/DraftSuggestionsContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { informationCircle } from "solid-heroicons/solid-mini";
import { Dialog } from "../common/Dialog";
import { ChampionDraftAnalysisDialog } from "../dialogs/ChampionDraftAnalysisDialog";
import { Team } from "@draftgap/core/src/models/Team";
import { championName } from "../../utils/i18n";
import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { formatPercentage } from "../../utils/rating";
import { RoleIcon } from "../icons/roles/RoleIcon";

export default function DraftTable() {
    const { dataset, dataset30Days } = useDataset();
    const { selection, pickChampion, select, bans, ownedChampions } =
        useDraft();
    const {
        search,
        roleFilter,
        setRoleFilter,
        favouriteFilter,
        setFavouriteFilter,
    } = useDraftFilters();
    const { allySuggestions, opponentSuggestions } = useDraftSuggestions();
    const { allyTeamComp, opponentTeamComp } = useDraftAnalysis();
    const { isFavourite, setFavourite, config } = useUser();

    let draftTableRoot!: HTMLDivElement;

    const suggestions = () =>
        selection.team === "opponent"
            ? opponentSuggestions()
            : allySuggestions();
    const opposingTeamComp = () =>
        selection.team === "opponent" ? allyTeamComp() : opponentTeamComp();
    const directMatchup = (suggestion: Suggestion) =>
        dataset30Days()
            ? getDirectMatchup(
                  dataset30Days()!,
                  suggestion.championKey,
                  suggestion.role,
                  opposingTeamComp(),
              )
            : undefined;
    const matchupAssumptions = createMemo(() => {
        const suggestionRoles = new Set(
            suggestions().map((suggestion) => suggestion.role),
        );

        return [...opposingTeamComp()]
            .filter(
                ([role]) =>
                    suggestionRoles.has(role) &&
                    (roleFilter() === undefined || roleFilter() === role),
            )
            .sort(([roleA], [roleB]) => roleA - roleB);
    });

    const ownsChampion = (championKey: string) =>
        // If we don't have owned champions, we are not logged in, so we own all champions.
        ownedChampions().size === 0 || ownedChampions().has(championKey);

    const filteredSuggestions = () => {
        let filtered = suggestions();
        if (!dataset()) {
            return filtered;
        }

        if (search()) {
            const str = search()
                .replaceAll(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "")
                .toLowerCase();
            filtered = filtered.filter((s) => {
                const champion = dataset()!.championData[s.championKey];
                return (
                    champion.name
                        .replaceAll(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "")
                        .toLowerCase()
                        .includes(str) ||
                    championName(champion, config)
                        .replaceAll(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "")
                        .toLowerCase()
                        .includes(str)
                );
            });
        }

        if (roleFilter() !== undefined) {
            filtered = filtered.filter((s) => s.role === roleFilter());
        }

        if (favouriteFilter()) {
            filtered = filtered.filter((s) =>
                isFavourite(s.championKey, s.role),
            );
        }

        if (config.showFavouritesAtTop) {
            // Sort is normally in place, but then tanstack table does not see the update.
            filtered = [...filtered].sort((a, b) => {
                const aFav = isFavourite(a.championKey, a.role);
                const bFav = isFavourite(b.championKey, b.role);
                if (aFav && !bFav) {
                    return -1;
                } else if (!aFav && bFav) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        if (config.banPlacement === "hidden") {
            filtered = filtered.filter((s) => !bans.includes(s.championKey));
        } else if (config.banPlacement === "bottom") {
            filtered = [...filtered].sort((a, b) => {
                const aBanned = bans.includes(a.championKey);
                const bBanned = bans.includes(b.championKey);
                if (aBanned && !bBanned) {
                    return 1;
                } else if (!aBanned && bBanned) {
                    return -1;
                } else {
                    return 0;
                }
            });
        }

        if (config.unownedPlacement === "hidden") {
            filtered = filtered.filter((s) => ownsChampion(s.championKey));
        } else if (config.unownedPlacement === "bottom") {
            filtered = [...filtered].sort((a, b) => {
                const aUnowned = !ownsChampion(a.championKey);
                const bUnowned = !ownsChampion(b.championKey);
                if (aUnowned && !bUnowned) {
                    return 1;
                } else if (!aUnowned && bUnowned) {
                    return -1;
                } else {
                    return 0;
                }
            });
        }

        return filtered;
    };

    const [analysisPick, _setAnalysisPick] = createSignal<{
        team: Team;
        championKey: string;
    }>();
    const [showAnalysisPick, setShowAnalysisPick] = createSignal(false);
    const [savedRoleFilter, setSavedRoleFilter] = createSignal<Role>();

    function restoreAnalysisPreview() {
        if (selection.team) {
            pickChampion(
                selection.team,
                selection.index,
                undefined,
                undefined,
                {
                    updateSelection: false,
                    resetFilters: false,
                    updateView: false,
                },
            );
        }
        setRoleFilter(savedRoleFilter());
    }

    function setAnalysisPick(
        pick:
            | { team: Team; championKey: string; role: Role | undefined }
            | undefined,
    ) {
        batch(() => {
            if (!pick) {
                restoreAnalysisPreview();
                setSavedRoleFilter(undefined);
                setShowAnalysisPick(false);
                return;
            }
            if (pick.role !== undefined) {
                setSavedRoleFilter(roleFilter());
                pickChampion(
                    selection.team!,
                    selection.index,
                    pick.championKey,
                    pick.role,
                    {
                        updateSelection: false,
                        resetFilters: false,
                        updateView: false,
                    },
                );
            }
            _setAnalysisPick(pick);
            setShowAnalysisPick(true);
        });
    }

    onCleanup(() => {
        if (showAnalysisPick()) restoreAnalysisPreview();
    });

    const columns: () => ColumnDef<Suggestion>[] = () => [
        {
            id: "favourite",
            header: () => (
                <button
                    type="button"
                    aria-label="Show favourite champions only"
                    aria-pressed={favouriteFilter()}
                    class="inline-flex size-11 items-center justify-center rounded-md group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
                    onClick={() => setFavouriteFilter(!favouriteFilter())}
                >
                    <Icon
                        path={star}
                        aria-hidden="true"
                        class="w-6 inline group-hover:opacity-80 transition duration-200 ease-out"
                        classList={{
                            "opacity-50": !favouriteFilter(),
                            "opacity-100!": favouriteFilter(),
                        }}
                    />
                </button>
            ),
            accessorFn: (suggestion) => suggestion,
            cell: (info) => (
                <div class="flex items-center justify-center">
                    <Show
                        when={isFavourite(
                            info.row.original.championKey,
                            info.row.original.role,
                        )}
                        fallback={
                            <Icon
                                path={starOutline}
                                aria-hidden="true"
                                class="w-6 opacity-0 group-hover/row:opacity-50 transition duration-200 ease-out group-hover/cell:opacity-80!"
                            />
                        }
                    >
                        <Icon
                            path={star}
                            aria-hidden="true"
                            class="w-6 opacity-50 group-hover/cell:opacity-80 transition duration-200 ease-out"
                        />
                    </Show>
                </div>
            ),

            meta: {
                headerClass: "w-1",
                onClickCell: (
                    e: MouseEvent,
                    info: CellContext<Suggestion, unknown>,
                ) => {
                    e.stopPropagation();
                    setFavourite(
                        info.row.original.championKey,
                        info.row.original.role,
                        !isFavourite(
                            info.row.original.championKey,
                            info.row.original.role,
                        ),
                    );
                },
            },
            enableSorting: false,
        },
        {
            header: "Role",
            accessorFn: (suggestion) => suggestion.role,
            cell: (info) => <RoleCell role={info.getValue<Role>()} />,
            meta: {
                headerClass: "w-1",
            },
            sortDescFirst: false,
        },
        {
            header: "Champion",
            accessorFn: (suggestion) => suggestion.championKey,
            cell: (info) => (
                <ChampionCell championKey={info.getValue<string>()} />
            ),
            sortingFn: (a, b, id) =>
                dataset()!.championData[
                    a.getValue<string>(id)
                ].name.localeCompare(
                    dataset()!.championData[b.getValue<string>(id)].name,
                ),
        },
        ...(config.showAdvancedWinrates
            ? ([
                  {
                      header: "Champions",
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.allyChampionRating.totalRating,
                      cell: (info) => (
                          <div class="flex justify-end">
                              <RatingText rating={info.getValue<number>()} />
                          </div>
                      ),
                  },
                  {
                      header: "Matchups",
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.matchupRating.totalRating,
                      cell: (info) => (
                          <div class="flex justify-end">
                              <RatingText rating={info.getValue<number>()} />
                          </div>
                      ),
                  },
                  {
                      header: "Duos",
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.allyDuoRating.totalRating,
                      cell: (info) => (
                          <div class="flex justify-end">
                              <RatingText rating={info.getValue<number>()} />
                          </div>
                      ),
                  },
              ] as ColumnDef<Suggestion>[])
            : []),
        {
            header: "Winrate",
            accessorFn: (suggestion) => suggestion.draftResult.totalRating,
            cell: (info) => {
                const matchup = () => directMatchup(info.row.original);

                return (
                    <div class="flex items-baseline justify-end gap-2">
                        <RatingText rating={info.getValue<number>()} />
                        <Show when={matchup()}>
                            <span
                                class="text-[0.7em] tabular-nums text-neutral-400"
                                title={`${formatPercentage(
                                    matchup()!.winrate,
                                )}% versus ${championName(
                                    dataset()!.championData[
                                        matchup()!.opponentChampionKey
                                    ],
                                    config,
                                )} ${
                                    displayNameByRole[info.row.original.role]
                                }; ${Math.round(
                                    matchup()!.games,
                                ).toLocaleString()} games over the last 30 days`}
                            >
                                ({formatPercentage(matchup()!.winrate)})
                            </span>
                        </Show>
                    </div>
                );
            },
        },
        {
            id: "actions",
            cell: (info) => (
                <button
                    type="button"
                    aria-label={`Open analysis for ${championName(
                        dataset()!.championData[info.row.original.championKey],
                        config,
                    )}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setAnalysisPick({
                            team: selection.team!,
                            championKey: info.row.original.championKey,
                            role: info.row.original.role,
                        });
                    }}
                    class="flex size-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
                >
                    <Icon
                        path={informationCircle}
                        class="w-5 h-5 opacity-40 hover:opacity-80 transition duration-150 ease-in-out"
                        aria-hidden="true"
                    />
                </button>
            ),
        },
    ];

    const [sorting, setSorting] = createSignal<SortingState>([]);
    const table = createSolidTable({
        get data() {
            return filteredSuggestions();
        },
        get columns() {
            return columns();
        },
        state: {
            get sorting() {
                return sorting();
            },
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    function pick(row: Row<Suggestion>) {
        if (!selection.team) {
            createMustSelectToast();
            return;
        }

        pickChampion(
            selection.team,
            selection.index,
            row.original.championKey,
            row.original.role,
        );

        draftTableRoot
            .closest("[data-draft-view]")
            ?.querySelector<HTMLInputElement>("[data-draft-search]")
            ?.focus();
    }

    onMount(() => {
        const draftTable =
            draftTableRoot.querySelector<HTMLElement>("[data-draft-table]");
        if (!draftTable) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.defaultPrevented ||
                e.isComposing ||
                e.ctrlKey ||
                e.altKey ||
                e.metaKey ||
                e.shiftKey
            ) {
                return;
            }

            if (
                document.querySelector(
                    '[role="dialog"][data-expanded], [role="menu"][data-expanded]',
                )
            ) {
                return;
            }

            const activeElement = document.activeElement;
            const activeRow =
                activeElement instanceof HTMLTableRowElement &&
                draftTable.contains(activeElement)
                    ? activeElement
                    : undefined;
            const eventTarget = e.target;
            if (!(eventTarget instanceof Element)) return;

            const draftView = draftTableRoot.closest("[data-draft-view]");
            const eventIsInDraftView =
                eventTarget === document.body ||
                Boolean(draftView?.contains(eventTarget));
            if (!eventIsInDraftView && !activeRow) return;

            if (
                !activeRow &&
                eventTarget.closest(
                    "input, textarea, select, option, button, a[href], [contenteditable]:not([contenteditable='false']), [role='button'], [role='menu'], [role='menuitem'], [role='dialog'], [aria-modal='true']",
                )
            ) {
                return;
            }

            const rows = () =>
                Array.from(
                    draftTable.querySelectorAll<HTMLTableRowElement>(
                        "tbody tr[tabindex='0']",
                    ),
                );
            const focusRow = (offset: -1 | 1) => {
                const availableRows = rows();
                if (availableRows.length === 0) return false;

                if (!activeRow) {
                    availableRows[0].focus();
                    return true;
                }

                const currentIndex = availableRows.indexOf(activeRow);
                availableRows[currentIndex + offset]?.focus();
                return true;
            };

            if (e.key === "ArrowLeft" || e.key === "h") {
                e.preventDefault();
                select("ally");
            } else if (e.key === "ArrowRight" || e.key === "l") {
                e.preventDefault();
                select("opponent");
            } else if (e.key === "ArrowUp" || e.key === "k") {
                if (focusRow(-1)) e.preventDefault();
            } else if (e.key === "ArrowDown" || e.key === "j") {
                if (focusRow(1)) e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        onCleanup(() => {
            window.removeEventListener("keydown", onKeyDown);
        });
    });

    return (
        <>
            <div ref={draftTableRoot} class="contents">
                <Show when={matchupAssumptions().length > 0}>
                    <div class="mb-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs uppercase text-neutral-500">
                        <span>Matchup assumptions</span>
                        <For each={matchupAssumptions()}>
                            {([role, championKey]) => (
                                <span class="inline-flex items-center gap-1 text-neutral-300">
                                    <RoleIcon role={role} class="h-4 w-4" />
                                    {displayNameByRole[role]}:{" "}
                                    {championName(
                                        dataset()!.championData[championKey],
                                        config,
                                    )}
                                </span>
                            )}
                        </For>
                        <span class="normal-case text-neutral-600">
                            Click an opponent role to override
                        </span>
                    </div>
                </Show>
                <Table
                    table={table}
                    onClickRow={pick}
                    rowClassName={(r) =>
                        bans.find((b) => b === r.original.championKey) ||
                        !ownsChampion(r.original.championKey)
                            ? "opacity-30"
                            : ""
                    }
                    data-draft-table
                />
            </div>
            <Dialog
                open={showAnalysisPick()}
                onOpenChange={(open) => {
                    if (!open) setAnalysisPick(undefined);
                }}
            >
                <ChampionDraftAnalysisDialog
                    championKey={analysisPick()!.championKey}
                    team={analysisPick()!.team}
                    openChampionDraftAnalysisModal={(team, championKey) =>
                        setAnalysisPick({ team, championKey, role: undefined })
                    }
                />
            </Dialog>
        </>
    );
}
