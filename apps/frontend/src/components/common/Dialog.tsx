import { Dialog as DialogPrimitives } from "@kobalte/core";
import { ComponentProps, Show, splitProps } from "solid-js";
import { cn } from "../../utils/style";
import { Icon } from "solid-heroicons";
import { xMark } from "solid-heroicons/solid";

export const Dialog = DialogPrimitives.Root;

export const DialogTrigger = DialogPrimitives.Trigger;

function DialogPortal(props: ComponentProps<typeof DialogPrimitives.Portal>) {
    return (
        <DialogPrimitives.Portal {...props}>
            <div class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:items-center sm:p-8">
                {props.children}
            </div>
        </DialogPrimitives.Portal>
    );
}

function DialogOverlay(props: ComponentProps<typeof DialogPrimitives.Overlay>) {
    return (
        <DialogPrimitives.Overlay
            {...props}
            class={cn(
                "fixed inset-0 bg-black/40 transition-colors",
                props.class,
            )}
        />
    );
}

export function DialogContent(
    props: ComponentProps<typeof DialogPrimitives.Content> & {
        canClose?: boolean;
    },
) {
    const [local, contentProps] = splitProps(props, [
        "canClose",
        "children",
        "class",
    ]);

    return (
        <DialogPortal>
            <DialogOverlay class="ui-expanded:animate-enter-opacity animate-leave-opacity" />
            <DialogPrimitives.Content
                {...contentProps}
                class={cn(
                    "fixed z-50 flex w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-primary shadow-lg animate-dialog-leave ui-expanded:animate-dialog-enter sm:max-h-[calc(100dvh-4rem)]",
                    local.class,
                )}
            >
                <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-6">
                    {local.children}
                </div>
                <Show when={local.canClose ?? true}>
                    <DialogPrimitives.CloseButton
                        aria-label="Close dialog"
                        class="absolute right-4 top-4 z-20 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none"
                    >
                        <Icon path={xMark} class="h-[24px] text-neutral-400" />
                    </DialogPrimitives.CloseButton>
                </Show>
            </DialogPrimitives.Content>
        </DialogPortal>
    );
}

export function DialogHeader(props: ComponentProps<"div">) {
    return (
        <div
            {...props}
            class={cn(
                "sticky top-0 z-10 -mx-4 -mt-4 flex flex-col space-y-1.5 border-b border-white/10 bg-primary px-4 pb-3 pt-4 pr-12 text-center sm:-mx-6 sm:-mt-6 sm:px-6 sm:pb-4 sm:pt-6 sm:pr-12 sm:text-left",
                props.class,
            )}
        >
            {props.children}
        </div>
    );
}

export function DialogFooter(props: ComponentProps<"div">) {
    return (
        <div
            {...props}
            class={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
                props.class,
            )}
        >
            {props.children}
        </div>
    );
}

export function DialogTitle(
    props: ComponentProps<typeof DialogPrimitives.Title>,
) {
    return (
        <DialogPrimitives.Title
            {...props}
            class={cn(
                "text-4xl uppercase font-medium leading-none",
                props.class,
            )}
        >
            {props.children}
        </DialogPrimitives.Title>
    );
}

export function DialogDescription(
    props: ComponentProps<typeof DialogPrimitives.Description>,
) {
    return (
        <DialogPrimitives.Description
            {...props}
            class={cn("text-sm text-neutral-400", props.class)}
        >
            {props.children}
        </DialogPrimitives.Description>
    );
}
