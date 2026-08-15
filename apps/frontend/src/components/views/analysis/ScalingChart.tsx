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

    return (
        <Chart
            chart={createScalingChartConfiguration(
                allyRatings(),
                opponentRatings(),
                (championKey) => dataset()?.championData[championKey]?.name,
            )}
        />
    );
}
