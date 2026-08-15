import { For, JSX, mergeProps, splitProps } from "solid-js";
import { cn } from "../../utils/style";

export type ButtonGroupOption<T> = {
    label: JSX.Element;
    value: T;
};

interface Props<T> {
    options: readonly ButtonGroupOption<T>[];
    selected: T;
    onChange: (value: T) => void;
    size?: "sm" | "md";
    layout?: "inline" | "grid";
    disabled?: boolean;
}

export function ButtonGroup<T>(
    _props: Props<T> & Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange">,
) {
    const mergedProps = mergeProps(
        { size: "md", layout: "inline" } as const,
        _props,
    );
    const [props, externalProps] = splitProps(mergedProps, [
        "options",
        "selected",
        "onChange",
        "size",
        "layout",
        "disabled",
    ]);
    return (
        <div
            {...externalProps}
            role={externalProps.role ?? "group"}
            class={cn(
                "isolate",
                {
                    "inline-flex rounded-md shadow-xs":
                        props.layout === "inline",
                    "grid w-full grid-cols-2 gap-2 sm:grid-cols-4":
                        props.layout === "grid",
                },
                externalProps.class,
            )}
        >
            <For each={props.options}>
                {(option, i) => (
                    <button
                        type="button"
                        disabled={props.disabled}
                        aria-pressed={props.selected === option.value}
                        class={cn(
                            "uppercase leading-4 relative inline-flex items-center border text-neutral-300 border-neutral-700 bg-primary px-3 font-medium hover:bg-neutral-600 focus:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary py-3 transition-all ease-in-out duration-150",
                            {
                                "rounded-r-md":
                                    props.layout === "inline" &&
                                    i() === props.options.length - 1,
                                "rounded-l-md":
                                    props.layout === "inline" && i() === 0,
                                "-ml-px":
                                    props.layout === "inline" && i() !== 0,
                                "justify-center rounded-md":
                                    props.layout === "grid",
                                "text-white bg-neutral-700":
                                    props.selected === option.value,
                                "py-2": props.size === "sm",
                                "cursor-not-allowed opacity-50 hover:bg-primary":
                                    props.disabled,
                            },
                        )}
                        onClick={() => props.onChange(option.value)}
                    >
                        {option.label}
                    </button>
                )}
            </For>
        </div>
    );
}
