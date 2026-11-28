import { VariantProps, cva } from "class-variance-authority";
import { JSX, splitProps } from "solid-js";
import { cn } from "../../utils/style";

export const buttonVariants = cva(
    "uppercase inline-flex items-center font-medium rounded-md transition ease-in-out duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900",
    {
        variants: {
            variant: {
                primary: "bg-white text-primary hover:bg-neutral-200",
                secondary:
                    "text-neutral-300 border border-neutral-700 bg-primary hover:bg-neutral-800",
                transparent: "hover:bg-white/10 disabled:pointer-events-none",
            },
            size: {
                default: "px-4 py-1 text-xl",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "default",
        },
    },
);

type Props = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants>;

export function Button(props: Props) {
    const [local, other] = splitProps(props, ["children", "variant", "size"]);

    return (
        <button
            {...other}
            type={other.type ?? "button"}
            class={cn(buttonVariants(local), props.class)}
        >
            {local.children}
        </button>
    );
}
