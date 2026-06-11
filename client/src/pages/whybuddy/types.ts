import type { V5CapabilityId } from "@shared/blueprint/contracts";

export type WhyArtifact = {
  id: string;
  kind: string;
  capability: V5CapabilityId;
  role: string;
  content: string;
  trustLevel: "untrusted" | "gated_pass" | "audited";
};

export type ChatTurn = {
  id: string;
  user: string;
  selected: Array<{ cap: V5CapabilityId; role: string }>;
  reason: string;
  artifacts: WhyArtifact[];
};

export type WhyBuddyExecutorMode = "pilot" | "server-llm" | "default";