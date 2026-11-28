import {
    batch,
    createContext,
    createSignal,
    JSX,
    onCleanup,
    useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
    getChampSelectSession,
    getCurrentSummoner,
    getGridChampions,
    getPickableChampionIds,
} from "../api/lcu-api";
import { getRoleFromString, Role } from "@draftgap/core/src/models/Role";
import { Team } from "@draftgap/core/src/models/Team";
import {
    LolChampSelectChampSelectPlayerSelection,
    LolChampSelectChampSelectSession,
    LolSummonerSummoner,
} from "../types/Lcu";
import {
    createImportFavouritePicksSuccessToast,
    createImportFavouritePicksToast,
} from "../utils/toast";
import { useDraft } from "./DraftContext";
import { useMedia } from "../hooks/useMedia";
import { useUser } from "./UserContext";
import { LolalyticsRole } from "../../../dataset/src/lolalytics/roles";
import { getLcuBanSlots } from "./lcu-bans";

const createChampSelectSession = (): LolChampSelectChampSelectSession => ({
    actions: [],
    allowBattleBoost: false,
    allowDuplicatePicks: false,
    allowLockedEvents: false,
    allowSkinSelection: false,
    bans: {
        myTeamBans: [],
        numBans: 0,
        theirTeamBans: [],
    },
    benchChampionIds: [],
    benchEnabled: false,
    boostableSkinCount: 0,
    chatDetails: {
        chatRoomName: "",
        chatRoomPassword: "",
    },
    counter: 0,
    entitledFeatureState: {
        additionalRerolls: 0,
        unlockedSkinIds: [],
    },
    gameId: 0,
    hasSimultaneousBans: false,
    hasSimultaneousPicks: false,
    isCustomGame: false,
    isSpectating: false,
    localPlayerCellId: 0,
    lockedEventIndex: 0,
    myTeam: [],
    recoveryCounter: 0,
    rerollsRemaining: 0,
    skipChampionSelect: false,
    theirTeam: [],
    timer: {
        adjustedTimeLeftInPhase: 0,
        internalNowInEpochMs: 0,
        isInfinite: false,
        phase: "",
        totalTimeInPhase: 0,
    },
    trades: [],
});

export const ClientState = {
    NotFound: "NotFound",
    MainMenu: "MainMenu",
    InChampSelect: "InChampSelect",
    Disabled: "Disabled",
} as const;

export type ClientState = (typeof ClientState)[keyof typeof ClientState];

export const createLolClientContext = () => {
    const { isDesktop } = useMedia();
    const {
        pickChampion,
        hoverChampion,
        select,
        resetAll,
        allyTeam,
        opponentTeam,
        setTeamBans,
        setOwnedChampions,
        setLocalPlayerIndex,
        selection,
        selectNextPick,
    } = useDraft();
    const { isFavourite, setFavourite } = useUser();

    const [clientState, setClientState] = createSignal<ClientState>(
        ClientState.NotFound,
    );
    const [clientError, setClientError] = createSignal<string | undefined>();
    const [champSelectSession, setChampSelectSession] =
        createStore<LolChampSelectChampSelectSession>(
            createChampSelectSession(),
        );
    const [hasCurrentSummoner, setHasCurrentSummoner] = createSignal(false);
    const [currentSummoner, setCurrentSummoner] =
        createStore<LolSummonerSummoner>({
            displayName: "",
            internalName: "",
            percentCompleteForNextLevel: 0,
            profileIconId: 0,
            puuid: "",
            rerollPoints: {
                currentPoints: 0,
                maxRolls: 0,
                numberOfRolls: 0,
                pointsCostToRoll: 0,
                pointsToReroll: 0,
            },
            summonerId: 0,
            summonerLevel: 0,
            xpSinceLastLevel: 0,
            xpUntilNextLevel: 0,
            accountId: "",
            nameChangeFlag: false,
            privacy: "",
        });

    let lastSelectedBanActionId: number | undefined;

    const updateChampSelectSession = (
        session: LolChampSelectChampSelectSession,
        firstTime = false,
    ) => {
        const actions = session.actions.flat();
        const nextPick = actions.find((a) => a.type === "pick" && !a.completed);
        const allyBansInProgress = actions.filter(
            (a) => a.type === "ban" && a.isInProgress && a.isAllyAction,
        );
        const currentBan =
            allyBansInProgress.find(
                (a) => a.actorCellId === session.localPlayerCellId,
            ) ?? allyBansInProgress[0];

        const getRole = (role: string) => {
            return {
                top: Role.Top,
                jungle: Role.Jungle,
                bottom: Role.Bottom,
                middle: Role.Middle,
                utility: Role.Support,
            }[role];
        };

        const processSelection = (
            selection: LolChampSelectChampSelectPlayerSelection,
            team: Team,
            index: number,
        ) => {
            const teamPicks = team === "ally" ? allyTeam : opponentTeam;

            const role = selection.assignedPosition
                ? getRole(selection.assignedPosition)
                : undefined;

            if (selection.championId) {
                const championKey = selection.championId.toString();
                if (teamPicks[index].championKey === championKey) {
                    return false;
                }
                const resetFilters =
                    hasCurrentSummoner() &&
                    currentSummoner.summonerId === selection.summonerId;
                pickChampion(team, index, championKey, role, {
                    updateSelection: false,
                    resetFilters,
                });

                return true;
            } else {
                let championKey = undefined;
                if (selection.championPickIntent) {
                    championKey = selection.championPickIntent.toString();
                }
                if (teamPicks[index].hoverKey !== championKey) {
                    hoverChampion(team, index, championKey, role);
                }
            }

            return false;
        };

        batch(() => {
            setLocalPlayerIndex(
                session.myTeam.findIndex(
                    (p) => p.cellId === session.localPlayerCellId,
                ),
            );
            let draftChanged = firstTime;
            for (let i = 0; i < session.myTeam.length; i++) {
                const selection = session.myTeam[i];
                draftChanged =
                    processSelection(selection, "ally", i) || draftChanged;
            }
            for (let i = 0; i < session.theirTeam.length; i++) {
                const selection = session.theirTeam[i];
                draftChanged =
                    processSelection(selection, "opponent", i) || draftChanged;
            }

            setTeamBans("ally", getLcuBanSlots(session, true));
            setTeamBans("opponent", getLcuBanSlots(session, false));

            const allyBansRemaining = actions.some(
                (a) => a.type === "ban" && a.isAllyAction && !a.completed,
            );
            if (
                !currentBan &&
                !allyBansRemaining &&
                lastSelectedBanActionId !== undefined
            ) {
                lastSelectedBanActionId = undefined;
                draftChanged = true;
            }
            if (currentBan) {
                if (currentBan.id !== lastSelectedBanActionId) {
                    lastSelectedBanActionId = currentBan.id;
                    select("ally", undefined, {
                        type: "ban",
                        resetFilters: false,
                    });
                }
            } else if (
                selection.type === "ban" &&
                !actions.some((a) => a.type === "ban" && !a.completed)
            ) {
                selectNextPick("ally", { resetFilters: false });
            } else if (nextPick?.isAllyAction && draftChanged) {
                const index = session.myTeam.findIndex(
                    (player) => player.cellId === nextPick.actorCellId,
                );
                select("ally", index, { resetFilters: false });
            }

            setChampSelectSession(session);
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const checkImportFavourites = async () => {
        const DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED =
            "draftgap-import-favourites-last-asked";
        const lastAsked = localStorage.getItem(
            DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED,
        );
        if (lastAsked) {
            const lastAskedDate = new Date(lastAsked);
            const now = new Date();
            const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
            if (now.getTime() - lastAskedDate.getTime() < ONE_WEEK) {
                return;
            }
        }

        const gridChampions = await getGridChampions();
        if (!gridChampions) {
            console.error("Failed to get grid champions");
            return;
        }

        const lolFavourites = gridChampions?.flatMap((c) =>
            c.positionsFavorited.map((p) => ({
                championKey: c.id.toString(),
                role: getRoleFromString(p as LolalyticsRole),
            })),
        );

        const nonFavouritePicks = lolFavourites.filter(
            (f) => !isFavourite(f.championKey, f.role),
        );

        if (!nonFavouritePicks.length) {
            return;
        }

        createImportFavouritePicksToast(() => {
            for (const nonFavourite of nonFavouritePicks) {
                setFavourite(nonFavourite.championKey, nonFavourite.role, true);
            }

            createImportFavouritePicksSuccessToast(nonFavouritePicks.length);
        });

        localStorage.setItem(
            DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED,
            new Date().toISOString(),
        );
    };

    const updateUnownedChampions = async () => {
        const ownedChampions = await getPickableChampionIds();
        if (!ownedChampions) {
            console.error("Failed to get owned champions");
            return;
        }

        setOwnedChampions(new Set(ownedChampions.map((c) => String(c))));
    };

    const [integrationTimeout, setIntegrationTimeout] = createSignal<
        NodeJS.Timeout | undefined
    >();

    const startLolClientIntegration = () => {
        if (!isDesktop) return;

        const update = async () => {
            try {
                if (!hasCurrentSummoner()) {
                    const summoner = await getCurrentSummoner();
                    if (summoner) {
                        setCurrentSummoner(summoner);
                        setHasCurrentSummoner(true);
                    }
                }

                const session = await getChampSelectSession();
                if (session == null) {
                    if (clientState() !== ClientState.MainMenu) {
                        setTeamBans("ally", []);
                        setTeamBans("opponent", []);
                        setOwnedChampions(new Set<string>());
                        setLocalPlayerIndex(undefined);
                        lastSelectedBanActionId = undefined;
                    }

                    setClientState(ClientState.MainMenu);
                } else {
                    batch(() => {
                        if (clientState() !== ClientState.InChampSelect) {
                            updateUnownedChampions();
                            // Disabled: favourites import prompt repeats, likely because WebView2 drops recent localStorage writes.
                            // checkImportFavourites();
                            resetAll();
                            lastSelectedBanActionId = undefined;
                        }

                        updateChampSelectSession(
                            session,
                            clientState() !== ClientState.InChampSelect,
                        );
                        setClientState(ClientState.InChampSelect);
                    });
                }
                setClientError(undefined);
            } catch (e) {
                setClientState(ClientState.NotFound);

                setClientError((e as any).toString());
            }

            const timeoutMs = {
                [ClientState.MainMenu]: 1000,
                [ClientState.InChampSelect]: 500,
                [ClientState.NotFound]: 2000,
                [ClientState.Disabled]: 2000,
            }[clientState()];
            setIntegrationTimeout(setTimeout(() => update(), timeoutMs));
        };
        update();
    };

    const stopLolClientIntegration = () => {
        if (integrationTimeout() != null) {
            clearTimeout(integrationTimeout());
        }
        setLocalPlayerIndex(undefined);
        setClientState(ClientState.Disabled);
    };

    onCleanup(() => {
        stopLolClientIntegration();
        setClientState(ClientState.NotFound);
    });

    return {
        clientState,
        champSelectSession,
        startLolClientIntegration,
        stopLolClientIntegration,
        clientError,
    };
};

export const LolClientContext =
    createContext<ReturnType<typeof createLolClientContext>>();

export function LolClientProvider(props: { children: JSX.Element }) {
    const ctx = createLolClientContext();

    return (
        <LolClientContext.Provider value={ctx}>
            {props.children}
        </LolClientContext.Provider>
    );
}

export const useLolClient = () => {
    const useCtx = useContext(LolClientContext);
    if (!useCtx) throw new Error("No LolClientContext found");

    return useCtx;
};
