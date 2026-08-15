import { Placement } from "@popperjs/core";
import { Accessor, JSX, onCleanup, onMount } from "solid-js";
import { useTooltip } from "../contexts/TooltipContext";

type HelpPopoverParams = {
    content: JSX.Element;
    placement?: Placement;
    delay?: number;
};

export function tooltip(
    el: HTMLElement,
    accessor: Accessor<HelpPopoverParams>,
) {
    const {
        popoverTarget,
        setPopoverContent,
        setPopoverPlacement,
        setPopoverTarget,
        setPopoverVisible,
    } = useTooltip();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let isHovered = false;
    let isFocused = false;
    const previousDescription = el.getAttribute("aria-describedby");

    const show = () => {
        const { content, placement, delay } = accessor();

        clearTimeout(timeout);

        timeout = setTimeout(() => {
            setPopoverContent(content);
            setPopoverPlacement(placement ?? "top");
            setPopoverTarget(el);
            setPopoverVisible(true);
        }, delay ?? 300);
    };

    const hide = () => {
        clearTimeout(timeout);
        if (isHovered || isFocused) return;
        if (popoverTarget() !== el) return;

        setPopoverVisible(false);
    };

    const onMouseEnter = () => {
        isHovered = true;
        show();
    };

    const onMouseLeave = () => {
        isHovered = false;
        hide();
    };

    const onFocus = () => {
        isFocused = true;
        show();
    };

    const onBlur = () => {
        isFocused = false;
        hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;

        clearTimeout(timeout);
        if (popoverTarget() !== el) return;

        isHovered = false;
        isFocused = false;
        setPopoverVisible(false);
    };

    onMount(() => {
        el.setAttribute(
            "aria-describedby",
            [previousDescription, "tooltip"].filter(Boolean).join(" "),
        );
        el.addEventListener("mouseenter", onMouseEnter);
        el.addEventListener("mouseleave", onMouseLeave);
        el.addEventListener("focus", onFocus);
        el.addEventListener("blur", onBlur);
        el.addEventListener("keydown", onKeyDown);
    });

    onCleanup(() => {
        el.removeEventListener("mouseenter", onMouseEnter);
        el.removeEventListener("mouseleave", onMouseLeave);
        el.removeEventListener("focus", onFocus);
        el.removeEventListener("blur", onBlur);
        el.removeEventListener("keydown", onKeyDown);
        if (previousDescription) {
            el.setAttribute("aria-describedby", previousDescription);
        } else {
            el.removeAttribute("aria-describedby");
        }
        if (popoverTarget() === el) {
            setPopoverVisible(false);
            setPopoverTarget(null);
        }
        clearTimeout(timeout);
    });
}
