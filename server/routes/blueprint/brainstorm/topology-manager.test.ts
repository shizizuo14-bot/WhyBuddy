import { describe, expect, it } from "vitest";

import type {
  BrainstormRoleId,
  BrainstormTopology,
} from "../../../../shared/blueprint/brainstorm-contracts";
import {
  buildDefaultTopology,
  resolveTopology,
} from "./topology-manager";

/**
 * Example unit tests for the Topology Manager (R5.1 / R5.3).
 *
 * Covers the concrete shape of `buildDefaultTopology` (acyclic critique chain,
 * synthesizer selection, default round bounds, single-role degenerate case) and
 * confirms a legal named topology is honored / passed through unchanged.
 *
 * _Requirements: 5.1, 5.3_
 */

describe("buildDefaultTopology — shape (R5.1)", () => {
  it("strings participating roles into an acyclic critique chain", () => {
    const roles: BrainstormRoleId[] = ["planner", "architect", "executor"];
    const topology = buildDefaultTopology(roles);

    // Each role critiques the next; the last role does NOT point back to the
    // first, so the relation graph is a DAG (n-1 edges for n roles).
    expect(topology.critiqueEdges).toEqual([
      { challenger: "planner", target: "architect" },
      { challenger: "architect", target: "executor" },
    ]);
    expect(topology.participants).toEqual(roles);
    expect(topology.name).toBe("default");
  });

  it("picks `decider` as the synthesizer when present", () => {
    const topology = buildDefaultTopology(["planner", "decider", "architect"]);
    expect(topology.synthesizerRoleId).toBe("decider");
  });

  it("falls back to the first participant as synthesizer when `decider` is absent", () => {
    const topology = buildDefaultTopology(["planner", "architect", "executor"]);
    expect(topology.synthesizerRoleId).toBe("planner");
  });

  it("uses default round bounds minRounds=2 / maxRounds=5", () => {
    const topology = buildDefaultTopology(["planner", "architect"]);
    expect(topology.minRounds).toBe(2);
    expect(topology.maxRounds).toBe(5);
  });

  it("yields an empty critique edge set for a single role (monologue)", () => {
    const topology = buildDefaultTopology(["planner"]);
    expect(topology.critiqueEdges).toEqual([]);
    expect(topology.participants).toEqual(["planner"]);
    expect(topology.synthesizerRoleId).toBe("planner");
  });

  it("de-duplicates roles while preserving order", () => {
    const topology = buildDefaultTopology([
      "planner",
      "architect",
      "planner",
      "executor",
    ]);
    expect(topology.participants).toEqual(["planner", "architect", "executor"]);
    expect(topology.critiqueEdges).toEqual([
      { challenger: "planner", target: "architect" },
      { challenger: "architect", target: "executor" },
    ]);
  });
});

describe("resolveTopology — legal named topology is honored (R5.3)", () => {
  it("passes a valid named topology through unchanged", () => {
    const roster: BrainstormRoleId[] = ["planner", "architect", "executor"];
    const named: BrainstormTopology = {
      name: "review-chain",
      participants: roster,
      critiqueEdges: [
        { challenger: "planner", target: "architect" },
        { challenger: "architect", target: "executor" },
      ],
      synthesizerRoleId: "decider",
      minRounds: 1,
      maxRounds: 3,
    };

    const result = resolveTopology({ participatingRoleIds: roster, named });

    expect(result.usedDefault).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.topology.name).toBe("review-chain");
    expect(result.topology.critiqueEdges).toEqual(named.critiqueEdges);
    expect(result.topology.synthesizerRoleId).toBe("decider");
    expect(result.topology.minRounds).toBe(1);
    expect(result.topology.maxRounds).toBe(3);
  });
});
