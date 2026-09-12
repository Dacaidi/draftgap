import {
    displayNameByPickRateLevel,
    getPickRateLevel,
    PickRateLevel,
} from "@draftgap/core/src/draft/pick-rate";
import { displayNameByRole, Role } from "@draftgap/core/src/models/Role";
import { formatPercentage } from "../../utils/rating";
import { cn } from "../../utils/style";

type Props = {
    pickRate: number;
    role: Role;
    class?: string;
};

const classByLevel: Record<PickRateLevel, string> = {
    [PickRateLevel.VeryHigh]: "text-red-300",
    [PickRateLevel.High]: "text-orange-300",
    [PickRateLevel.Medium]: "text-yellow-300",
    [PickRateLevel.Low]: "text-neutral-400",
};

export function PickRateText(props: Props) {
    const level = () => getPickRateLevel(props.pickRate);

    return (
        <span
            class={cn(
                "whitespace-nowrap font-semibold uppercase tabular-nums",
                classByLevel[level()],
                props.class,
            )}
            title={`${formatPercentage(props.pickRate, 2)}% pick rate in ${displayNameByRole[
                props.role
            ].toLowerCase()} over the last 30 days. Very High: 10%+, High: 5-10%, Medium: 2-5%, Low: below 2%.`}
        >
            {`${displayNameByPickRateLevel[level()]} (${formatPercentage(
                props.pickRate,
                1,
            )}%)`}
        </span>
    );
}
