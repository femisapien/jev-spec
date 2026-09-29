import type {
  AnyAssertion,
  AnyRubric,
  AnyRubricResult,
  AssertionEvaluation,
  ChoiceAssertion,
  ChoiceResult,
  NoulAssertion,
  NoulResult,
  ScoreAssertion,
  ScoreResult,
} from '../types.js';

export function assertRubric(
  rubricName: string,
  rubric: AnyRubric,
  result: AnyRubricResult,
  assertion?: AnyAssertion
): AssertionEvaluation {
  if (!assertion) {
    return {
      rubricName,
      rubric,
      result,
      passed: true,
    };
  }

  if (result.type === 'noul') {
    return assertNoul(rubricName, rubric, result, assertion as NoulAssertion);
  } else if (result.type === 'choice') {
    return assertChoice(rubricName, rubric, result, assertion as ChoiceAssertion);
  } else if (result.type === 'score') {
    return assertScore(rubricName, rubric, result, assertion as ScoreAssertion);
  }

  return {
    rubricName,
    rubric,
    result,
    passed: true,
  };
}

/**
 * A comparison against NaN is always false, and a value outside its range clears one side of any
 * threshold, so either would let a malformed evaluator answer slip through. Asserted values must
 * be numbers from 0 to `max`; the comparisons below are false for NaN.
 */
function outOfRangeReason(label: string, value: number, max: number): string | undefined {
  return value >= 0 && value <= max
    ? undefined
    : `Evaluator returned an invalid ${label} (${value}): expected a number from 0 to ${max}`;
}

function assertNoul(
  rubricName: string,
  rubric: AnyRubric,
  result: NoulResult,
  assertion: NoulAssertion
): AssertionEvaluation {
  const invalid = outOfRangeReason('probability', result.probability, 1);
  if (invalid) {
    return { rubricName, rubric, result, passed: false, reason: invalid };
  }

  if (assertion.minProbability !== undefined && result.probability < assertion.minProbability) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Probability ${result.probability.toFixed(2)} is below minimum threshold ${assertion.minProbability.toFixed(2)}`,
    };
  }

  if (assertion.maxProbability !== undefined && result.probability > assertion.maxProbability) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Probability ${result.probability.toFixed(2)} exceeds maximum threshold ${assertion.maxProbability.toFixed(2)}`,
    };
  }

  return { rubricName, rubric, result, passed: true };
}

function assertMinConfidence(confidence: number, minConfidence?: number): string | undefined {
  if (minConfidence === undefined) {
    return undefined;
  }
  const invalid = outOfRangeReason('confidence', confidence, 1);
  if (invalid) {
    return invalid;
  }
  if (confidence < minConfidence) {
    return `Confidence ${confidence.toFixed(2)} is below required threshold ${minConfidence.toFixed(2)}`;
  }
  return undefined;
}

function assertChoice(
  rubricName: string,
  rubric: AnyRubric,
  result: ChoiceResult,
  assertion: ChoiceAssertion
): AssertionEvaluation {
  if (assertion.allowedChoices && !assertion.allowedChoices.includes(result.choice)) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Selected choice "${result.choice}" is not in allowed list: [${assertion.allowedChoices.join(', ')}]`,
    };
  }

  if (assertion.blockedChoices?.includes(result.choice)) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Selected choice "${result.choice}" is in blocked list: [${assertion.blockedChoices.join(', ')}]`,
    };
  }

  const confidenceReason = assertMinConfidence(result.confidence, assertion.minConfidence);
  if (confidenceReason) {
    return { rubricName, rubric, result, passed: false, reason: confidenceReason };
  }

  return { rubricName, rubric, result, passed: true };
}

function assertScore(
  rubricName: string,
  rubric: AnyRubric,
  result: ScoreResult,
  assertion: ScoreAssertion
): AssertionEvaluation {
  // The top level comes from the configuration, not from the answer. A rubric of another type
  // yields NaN, so the score fails.
  const topLevel = rubric.type === 'score' ? rubric.levels.length - 1 : Number.NaN;
  const invalid = outOfRangeReason('score', result.score, topLevel);
  if (invalid) {
    return { rubricName, rubric, result, passed: false, reason: invalid };
  }

  if (assertion.minScore !== undefined && result.score < assertion.minScore) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Score ${result.score.toFixed(1)} is below minimum threshold ${assertion.minScore.toFixed(1)}`,
    };
  }

  if (assertion.maxScore !== undefined && result.score > assertion.maxScore) {
    return {
      rubricName,
      rubric,
      result,
      passed: false,
      reason: `Score ${result.score.toFixed(1)} exceeds maximum threshold ${assertion.maxScore.toFixed(1)}`,
    };
  }

  const confidenceReason = assertMinConfidence(result.confidence, assertion.minConfidence);
  if (confidenceReason) {
    return { rubricName, rubric, result, passed: false, reason: confidenceReason };
  }

  return { rubricName, rubric, result, passed: true };
}
