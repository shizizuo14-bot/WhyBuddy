import type { BlueprintClarificationAnswer } from "../../../../shared/blueprint/contracts.js";

export function isClarificationAnswersNoop(
  existingAnswers: readonly BlueprintClarificationAnswer[],
  nextAnswers: readonly BlueprintClarificationAnswer[],
): boolean {
  const existingByQuestionId = new Map(
    existingAnswers.map((answer) => [answer.questionId, answer.answer]),
  );

  return nextAnswers.every(
    (answer) =>
      existingByQuestionId.has(answer.questionId) &&
      existingByQuestionId.get(answer.questionId) === answer.answer,
  );
}
