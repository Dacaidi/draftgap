import { Icon } from "solid-heroicons";
import { funnel } from "solid-heroicons/solid";
import { ButtonGroup, ButtonGroupOption } from "../common/ButtonGroup";
import { Popover, PopoverContent, PopoverTrigger } from "../common/Popover";
import { useUser } from "../../contexts/UserContext";
import { buttonVariants } from "../common/Button";
import { cn } from "../../utils/style";

export function FilterMenu() {
    const { config, setConfig } = useUser();

    const minGameCountOptions: ButtonGroupOption<number>[] = [
        500, 1000, 2500, 5000,
    ].map((n) => ({
        value: n,
        label: n.toString(),
    }));

    return (
        <Popover>
            <PopoverTrigger
                type="button"
                aria-label="Open draft filters"
                class={cn(
                    buttonVariants({ variant: "transparent" }),
                    "size-11 justify-center p-0",
                )}
            >
                <Icon
                    path={funnel}
                    class="w-6 text-neutral-300"
                    aria-hidden="true"
                />
            </PopoverTrigger>
            <PopoverContent>
                <span class="text-2xl uppercase block mb-1 leading-none">
                    Filters
                </span>
                <span class="text-lg uppercase block">
                    Minimum game count (7d)
                </span>
                <ButtonGroup
                    options={minGameCountOptions}
                    selected={config.minGames}
                    onChange={(value: number) =>
                        setConfig({
                            minGames: value,
                        })
                    }
                />
            </PopoverContent>
        </Popover>
    );
}
