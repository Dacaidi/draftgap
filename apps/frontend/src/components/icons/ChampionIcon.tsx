import { JSX, splitProps } from "solid-js";
import { useDataset } from "../../contexts/DatasetContext";
import { cn } from "../../utils/style";
import {
    championIconSources,
    applyImageFallback,
} from "../../utils/champion-images";

export function ChampionIcon(
    props: {
        championKey: string;
        imgClass?: string;
        size: number;
    } & JSX.HTMLAttributes<HTMLDivElement>,
) {
    const [, other] = splitProps(props, ["championKey", "imgClass", "size"]);
    const { dataset } = useDataset();
    const champion = () => dataset()!.championData[props.championKey];
    const sources = () => championIconSources(dataset()!.version, champion());

    return (
        <div
            {...other}
            class={cn("relative overflow-hidden rounded-sm", props.class)}
            style={{
                width: props.size + "px",
                height: props.size + "px",
            }}
        >
            <img
                src={sources().primary}
                onError={(event) =>
                    applyImageFallback(event.currentTarget, sources().fallback)
                }
                class={`absolute ${props.imgClass}`}
                alt={champion().name}
                style={{
                    width: props.size * 1.11 + "px",
                    height: props.size * 1.11 + "px",
                    "max-width": props.size * 1.11 + "px",
                    top: -props.size * 0.055 + "px",
                    left: -props.size * 0.055 + "px",
                }}
            />
        </div>
    );
}
