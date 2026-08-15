import { For } from "solid-js";
import { cn } from "../../utils/style";

type Props<T> = {
    tabs: readonly {
        value: T;
        label: string;
    }[];
    selected: T;
    onChange: (tab: T) => void;
    class?: string;
    equals?: (a: T, b: T) => boolean;
};

export const ViewTabs = <T,>(props: Props<T>) => {
    return (
        <div
            role="tablist"
            class={cn(
                "bg-primary w-full border-b border-neutral-700",
                props.class,
            )}
        >
            <For each={props.tabs}>
                {(tab) => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={
                            props.equals
                                ? props.equals(tab.value, props.selected)
                                : tab.value === props.selected
                        }
                        class={cn(
                            "relative -mb-px border-b-2 border-transparent px-4 py-3 text-neutral-400 uppercase font-semibold transition-colors hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ally",
                            {
                                "border-ally text-neutral-50 hover:text-neutral-50":
                                    props.equals
                                        ? props.equals(
                                              tab.value,
                                              props.selected,
                                          )
                                        : tab.value === props.selected,
                            },
                        )}
                        onClick={() => props.onChange(tab.value)}
                    >
                        {tab.label}
                    </button>
                )}
            </For>
        </div>
    );
};
