import type { NavigationObservation, Verdict } from "./types.js";

export function judgeNavigationObservation(observation: NavigationObservation): Verdict {
  if (observation.blockedReason) return "BLOCKED";
  if (!observation.observedTargetId) return "INCONCLUSIVE";
  if (observation.observedTargetId === observation.expectedTargetId) return "LOST";
  if (observation.observedTargetId === observation.reportedObservedTargetId) return "PRESERVED";
  return "INCONCLUSIVE";
}
