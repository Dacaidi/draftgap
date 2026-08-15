import { createMediaQuery } from "./createMediaQuery";
import { isTauri } from "@tauri-apps/api/core";

export function useMedia() {
    const isDesktop = isTauri();
    const isMobileLayout = createMediaQuery("(max-width: 1279px)");

    return {
        isDesktop,
        isMobileLayout,
    };
}
