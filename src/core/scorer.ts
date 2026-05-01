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
  const breakdown = calculateScoreDeductions(inputs);
  return Math.max(
    0,
    breakdown.baseScore -
      breakdown.duplicates -
      breakdown.outdated -
      breakdown.unused -
      breakdown.risks
  );
}

export function calculateScoreDeductions(inputs: ScoreInputs): {
  baseScore: number;
  duplicates: number;
  outdated: number;
  unused: number;
  risks: number;
} {
  const duplicateWeight = inputs.duplicateWeight ?? 5;
  const outdatedWeight = inputs.outdatedWeight ?? 3;
  const unusedWeight = inputs.unusedWeight ?? 4;
  const riskWeight = inputs.riskWeight ?? 10;

  return {
    baseScore: 100,
    duplicates: Math.min(35, inputs.duplicates * duplicateWeight),
    outdated: Math.min(25, inputs.outdated * outdatedWeight),
    unused: Math.min(20, inputs.unused * unusedWeight),
    risks: Math.min(30, inputs.risks * riskWeight)
  };
}
