import {
    displayNameByPickRateLevel,
    getPickRateLevel,
    getPickRatePercentile,
    PickRateLevel,
} from "@draftgap/core/src/draft/pick-rate";
import { displayNameByRole, Role } from "@draftgap/core/src/models/Role";
import { formatPercentage } from "../../utils/rating";
import { cn } from "../../utils/style";

type Props = {
    pickRate: number;
    role: Role;
    distribution: readonly number[];
    class?: string;
};

const classByLevel: Record<PickRateLevel, string> = {
    [PickRateLevel.VeryHigh]: "text-red-300",
    [PickRateLevel.High]: "text-orange-300",
    [PickRateLevel.Medium]: "text-yellow-300",
    [PickRateLevel.Low]: "text-neutral-400",
};

export function PickRateText(props: Props) {
    const percentile = () =>
        getPickRatePercentile(props.pickRate, props.distribution);
    const level = () => getPickRateLevel(props.pickRate, props.distribution);

    return (
        <span
            class={cn(
                "whitespace-nowrap font-semibold uppercase tabular-nums",
                classByLevel[level()],
                props.class,
            )}
            title={`${formatPercentage(props.pickRate, 2)}% pick rate in ${displayNameByRole[
                props.role
            ].toLowerCase()} over the last 30 days; percentile rank ${Math.round(
                percentile() * 100,
            )}% for that role. Very High: top 10%, High: next 20%, Medium: next 30%, Low: remaining 40%.`}
        >
            {`${displayNameByPickRateLevel[level()]} (${formatPercentage(
                props.pickRate,
                1,
            )}%)`}
        </span>
    );
}
