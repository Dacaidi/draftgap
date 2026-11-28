import { JSXElement, createContext, createMemo, useContext } from "solid-js";
import { getSuggestions } from "@draftgap/core/src/draft/suggestions";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { getBanSuggestions } from "@draftgap/core/src/draft/bans";
import { useDraft } from "./DraftContext";
import { useDraftFilters } from "./DraftFiltersContext";

export function createDraftSuggestionsContext() {
    const { isLoaded, dataset, dataset30Days } = useDataset();
    const {
        draftAnalysisConfig,
        allyTeamComp,
        opponentTeamComp,
        getAnalyzedChampionKey,
    } = useDraftAnalysis();
    const { selection, allyTeam, opponentTeam, allBans } = useDraft();
    const { roleFilter } = useDraftFilters();

    const allySuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            allyTeamComp(),
            opponentTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const opponentSuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            opponentTeamComp(),
            allyTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const banSuggestions = createMemo(() => {
        if (!isLoaded() || selection.type !== "ban" || !selection.team)
            return [];

        const unavailable = new Set(allBans());
        for (const team of ["ally", "opponent"] as const) {
            const picks = team === "ally" ? allyTeam : opponentTeam;
            for (let index = 0; index < picks.length; index++) {
                const key = getAnalyzedChampionKey(team, index);
                if (key) unavailable.add(key);
            }
        }
        return getBanSuggestions(
            dataset()!,
            selection.team === "ally"
                ? opponentSuggestions()
                : allySuggestions(),
            unavailable,
            roleFilter(),
        );
    });

    return { allySuggestions, opponentSuggestions, banSuggestions };
}

export const DraftSuggestionsContext =
    createContext<ReturnType<typeof createDraftSuggestionsContext>>();

export function DraftSuggestionsProvider(props: { children: JSXElement }) {
    return (
        <DraftSuggestionsContext.Provider
            value={createDraftSuggestionsContext()}
        >
            {props.children}
        </DraftSuggestionsContext.Provider>
    );
}

export function useDraftSuggestions() {
    const useCtx = useContext(DraftSuggestionsContext);
    if (!useCtx) throw new Error("No DraftSuggestionsContext found");

    return useCtx;
}
