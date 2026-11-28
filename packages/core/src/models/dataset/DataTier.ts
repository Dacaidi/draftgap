export const DataTiers = [
    "gold",
    "gold_plus",
    "platinum",
    "platinum_plus",
    "emerald",
    "emerald_plus",
    "diamond",
    "diamond_plus",
] as const;

export type DataTier = (typeof DataTiers)[number];

export const DEFAULT_DATA_TIER: DataTier = "emerald_plus";

export const displayNameByDataTier: Record<DataTier, string> = {
    gold: "Gold",
    gold_plus: "Gold+",
    platinum: "Platinum",
    platinum_plus: "Platinum+",
    emerald: "Emerald",
    emerald_plus: "Emerald+",
    diamond: "Diamond",
    diamond_plus: "Diamond+",
};
