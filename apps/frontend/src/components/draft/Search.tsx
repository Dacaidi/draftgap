import { Icon } from "solid-heroicons";
import { magnifyingGlass, xMark } from "solid-heroicons/outline";
import { onCleanup, onMount, Show } from "solid-js";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { useUser } from "../../contexts/UserContext";

export function Search() {
    const { search, setSearch } = useDraftFilters();
    const { setConfig } = useUser();

    // eslint-disable-next-line prefer-const -- solid js ref
    let inputEl: HTMLInputElement | undefined = undefined;

    function onInput(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        setSearch(input.value);
        if (input.value === "DANGEROUSLY_ENABLE_BETA_FEATURES") {
            setConfig((config) => ({ ...config, enableBetaFeatures: true }));
            setSearch("");
        }
        if (input.value === "DANGEROUSLY_DISABLE_BETA_FEATURES") {
            setConfig((config) => ({ ...config, enableBetaFeatures: false }));
            setSearch("");
        }
    }

    onMount(() => {
        if (!inputEl) return;
        const el = inputEl as HTMLInputElement;

        const onControlF = (e: KeyboardEvent) => {
            if (
                document.querySelector(
                    '[role="dialog"][data-expanded], [role="menu"][data-expanded]',
                )
            ) {
                return;
            }
            if (e.ctrlKey && (e.key === "f" || e.key == "k")) {
                e.preventDefault();
                el.focus();
            }
        };
        window.addEventListener("keydown", onControlF);
        onCleanup(() => {
            window.removeEventListener("keydown", onControlF);
        });
    });

    function focusFirstResult(e: KeyboardEvent) {
        if (e.key !== "Enter" && e.key !== "ArrowDown") return;

        const firstTableRow = inputEl
            ?.closest("[data-draft-view]")
            ?.querySelector<HTMLElement>(
                "[data-draft-table] tbody tr[tabindex='0']",
            );
        if (!firstTableRow) return;

        e.preventDefault();
        firstTableRow.focus();
    }

    return (
        <div class="flex rounded-md flex-1">
            <div class="relative flex grow items-stretch">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon
                        path={magnifyingGlass}
                        class="h-5 w-5 text-gray-400"
                        aria-hidden="true"
                    />
                </div>
                <input
                    ref={inputEl}
                    data-draft-search
                    aria-label="Search champions"
                    class="h-11 text-lg py-1 block w-full rounded-md rounded-l-md border-gray-301 pl-10 pr-11 bg-neutral-800 placeholder:text-neutral-400 text-neutral-100"
                    placeholder="SEARCH"
                    value={search()}
                    onInput={onInput}
                    onKeyDown={focusFirstResult}
                />
                <Show when={search().length}>
                    <button
                        type="button"
                        class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
                        onClick={() => setSearch("")}
                        aria-label="Clear champion search"
                    >
                        <Icon
                            path={xMark}
                            class="h-5 w-5 text-gray-400"
                            aria-hidden="true"
                        />
                    </button>
                </Show>
            </div>
        </div>
    );
}
