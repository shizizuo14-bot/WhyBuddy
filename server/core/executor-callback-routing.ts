export function isBlueprintExecutorMissionId(missionId: string): boolean {
  const normalized = missionId.trim();
  return normalized.startsWith("blueprint:") || normalized.startsWith("blueprint-job-");
}
