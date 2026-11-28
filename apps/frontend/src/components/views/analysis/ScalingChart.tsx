import { useExtraDraftAnalysis } from "../../../contexts/ExtraDraftAnalysisContext";
import { Chart } from "../../common/Chart";
import { useDataset } from "../../../contexts/DatasetContext";
import { createScalingChartConfiguration } from "./scaling-chart-config";

export function ScalingChart() {
    const { allyDraftExtraAnalysis, opponentDraftExtraAnalysis } =
        useExtraDraftAnalysis();
    const { dataset } = useDataset();

    const allyRatings = () => allyDraftExtraAnalysis()?.ratingByTime ?? [];
    const opponentRatings = () =>
        opponentDraftExtraAnalysis()?.ratingByTime ?? [];
    const timeBuckets = () =>
        allyDraftExtraAnalysis()?.timeBuckets ??
        opponentDraftExtraAnalysis()?.timeBuckets ??
        [];

    return (
        <Chart
            ariaLabel="Ally and opponent scaling by final game duration"
            chart={createScalingChartConfiguration(
                allyRatings(),
                opponentRatings(),
                timeBuckets(),
                (championKey) => dataset()?.championData[championKey]?.name,
            )}
        />
    );
}
