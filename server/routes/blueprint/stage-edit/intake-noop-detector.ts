import type {
  BlueprintIntake,
  BlueprintIntakePatchRequest,
} from "../../../../shared/blueprint/contracts.js";

export function isIntakePatchNoop(
  intake: BlueprintIntake,
  patch: BlueprintIntakePatchRequest,
): boolean {
  if (
    hasOwn(patch, "targetText") &&
    patch.targetText !== intake.targetText
  ) {
    return false;
  }

  if (
    hasOwn(patch, "githubUrls") &&
    !areStringArraysEqual(patch.githubUrls, intake.githubUrls)
  ) {
    return false;
  }

  return true;
}

function hasOwn<T extends object>(
  value: T,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function areStringArraysEqual(
  left: string[] | undefined,
  right: string[],
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}
