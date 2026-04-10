export interface ScoreInputs {
  duplicates: number;
  unused: number;
  outdated: number;
  risks: number;
  duplicateWeight?: number;
  unusedWeight?: number;
  outdatedWeight?: number;
  riskWeight?: number;
}

export function calculateHealthScore(inputs: ScoreInputs): number {
  const duplicateWeight = inputs.duplicateWeight ?? 5;
  const outdatedWeight = inputs.outdatedWeight ?? 3;
  const unusedWeight = inputs.unusedWeight ?? 4;
  const riskWeight = inputs.riskWeight ?? 10;

  const rawScore =
    100 -
    inputs.duplicates * duplicateWeight -
    inputs.outdated * outdatedWeight -
    inputs.unused * unusedWeight -
    inputs.risks * riskWeight;

  return Math.max(0, rawScore);
}
