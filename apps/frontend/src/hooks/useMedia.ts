import { createMediaQuery } from "./createMediaQuery";
import { isTauri } from "@tauri-apps/api/core";

export function useMedia() {
    const isDesktop = isTauri();
    const isMobileLayout = createMediaQuery("(max-width: 639px)");

    return {
        isDesktop,
        isMobileLayout,
    };
}
