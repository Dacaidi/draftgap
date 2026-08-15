import { ComponentProps, splitProps } from "solid-js";
import { Switch as SwitchPrimitives } from "@kobalte/core";
import { cn } from "../../utils/style";

export function Switch(props: ComponentProps<typeof SwitchPrimitives.Root>) {
    const [local, rootProps] = splitProps(props, [
        "class",
        "aria-label",
        "aria-labelledby",
        "aria-describedby",
    ]);

    return (
        <SwitchPrimitives.Root
            {...rootProps}
            class={cn(
                "relative inline-flex h-6 w-11 bg-neutral-700 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out hover:bg-neutral-600 has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-neutral-900",
                {
                    "bg-secondary hover:bg-secondary": props.checked,
                },
                local.class,
            )}
        >
            <SwitchPrimitives.Input
                aria-label={local["aria-label"]}
                aria-labelledby={local["aria-labelledby"]}
                aria-describedby={local["aria-describedby"]}
            />
            <SwitchPrimitives.Control class="w-full">
                <SwitchPrimitives.Thumb
                    aria-hidden="true"
                    class={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white neutral-900 shadow-sm ring-0 transition duration-200 ease-in-out",
                        {
                            "translate-x-5": props.checked,
                            "translate-x-0": !props.checked,
                        },
                    )}
                />
            </SwitchPrimitives.Control>
        </SwitchPrimitives.Root>
    );
}
