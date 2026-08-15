import { Icon } from "solid-heroicons";
import { language } from "solid-heroicons/solid";
import { Component } from "solid-js";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./common/DropdownMenu";
import { cn } from "../utils/style";
import { buttonVariants } from "./common/Button";
import { useUser } from "../contexts/UserContext";

export const LanguageDropdownMenu: Component = () => {
    const { config, setConfig } = useUser();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Change language"
                class={cn(
                    buttonVariants({ variant: "transparent" }),
                    "size-11 justify-center p-0",
                )}
            >
                <Icon path={language} class="w-7" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56">
                <DropdownMenuLabel>Language</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem
                        aria-current={
                            config.language === "en_US" ? "true" : undefined
                        }
                        onSelect={() => setConfig({ language: "en_US" })}
                        class={cn(
                            config.language === "en_US" && "bg-neutral-700",
                        )}
                    >
                        <span>English</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        aria-current={
                            config.language === "zh_CN" ? "true" : undefined
                        }
                        onSelect={() => setConfig({ language: "zh_CN" })}
                        class={cn(
                            config.language === "zh_CN" && "bg-neutral-700",
                        )}
                    >
                        <span>Simplified Chinese</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel class="text-neutral-500 text-sm">
                    Only affects champion names
                </DropdownMenuLabel>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
