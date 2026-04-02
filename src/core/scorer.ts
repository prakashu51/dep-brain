export interface ScoreInputs {
  duplicates: number;
  unused: number;
  outdated: number;
  risks: number;
}

export function calculateHealthScore(inputs: ScoreInputs): number {
  const rawScore =
    100 -
    inputs.duplicates * 5 -
    inputs.outdated * 3 -
    inputs.unused * 4 -
    inputs.risks * 10;

  return Math.max(0, rawScore);
}
