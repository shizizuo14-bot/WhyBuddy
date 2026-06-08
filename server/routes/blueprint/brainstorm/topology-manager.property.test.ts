// Feature: autopilot-brainstorm-real-collaboration, Property 7: Topology is always valid, executable, and honored
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type {
  BrainstormRoleId,
  BrainstormTopology,
  TopologyCritiqueEdge,
} from "../../../../shared/blueprint/brainstorm-contracts";
import {
  buildDefaultTopology,
  resolveTopology,
  validateTopology,
  type ResolveTopologyInput,
} from "./topology-manager";

/**
 * Property 7 (design.md §Correctness Properties):
 *
 *   For ANY topology input (valid named, invalid, missing, off-roster role,
 *   self-loop, or cyclic), `resolveTopology` SHALL return a VALID, EXECUTABLE
 *   topology whose every `critiqueEdge` endpoint is a session participant
 *   (falling back to the default topology with a recorded reason when invalid),
 *   and the resolved critique relation graph is acyclic.
 *
 * Validates: Requirements 5.2, 5.4, 5.5, 12.6
 *
 * The generator deliberately mixes well-formed and malformed topologies:
 * off-roster endpoints, self-loops, cyclic edges, empty edge sets, NaN/±Infinity
 * round bounds and `null` / `undefined` named topologies, so the universal
 * invariant is exercised across the whole input space (≥100 runs).
 */

const KNOWN_ROLES: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

/** A role-id-like value: a known role, an off-roster string, or junk (incl. empty). */
const roleLikeArb = fc.oneof(
  fc.constantFrom(...KNOWN_ROLES),
  fc.string({ maxLength: 6 }),
);

const edgeArb: fc.Arbitrary<TopologyCritiqueEdge> = fc.record({
  // `challenger` / `target` drawn from the same small pool so cycles and
  // self-loops arise frequently.
  challenger: roleLikeArb,
  target: roleLikeArb,
});

/** Round bounds incl. non-finite / negative / fractional values. */
const roundArb = fc.oneof(
  fc.integer({ min: -5, max: 12 }),
  fc.double(),
  fc.constantFrom(NaN, Infinity, -Infinity, 0, 1, 2, 5),
);

const namedTopologyArb: fc.Arbitrary<BrainstormTopology> = fc.record({
  name: fc.oneof(fc.string({ maxLength: 8 }), fc.constant("")),
  participants: fc.array(roleLikeArb, { maxLength: 8 }),
  critiqueEdges: fc.array(edgeArb, { maxLength: 12 }),
  synthesizerRoleId: roleLikeArb,
  minRounds: roundArb,
  maxRounds: roundArb,
}) as fc.Arbitrary<BrainstormTopology>;

const inputArb: fc.Arbitrary<ResolveTopologyInput> = fc.record({
  participatingRoleIds: fc.array(roleLikeArb, { maxLength: 8 }),
  named: fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    namedTopologyArb,
  ),
}) as fc.Arbitrary<ResolveTopologyInput>;

// --- Independent helpers (re-implemented in the test, not imported) ---------

/** De-duplicate non-empty trimmed strings, preserving first-occurrence order. */
function sanitizeRoster(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim().length > 0 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** Independent DFS cycle detection (incl. self-loops) over critique edges. */
function isAcyclic(edges: TopologyCritiqueEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.challenger);
    nodes.add(e.target);
    const list = adjacency.get(e.challenger);
    if (list) list.push(e.target);
    else adjacency.set(e.challenger, [e.target]);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const start of nodes) {
    if (color.get(start) === BLACK) continue;
    const stack: Array<{ node: string; index: number }> = [
      { node: start, index: 0 },
    ];
    color.set(start, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.index >= neighbors.length) {
        color.set(frame.node, BLACK);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.index];
      frame.index += 1;
      const nc = color.get(next) ?? WHITE;
      if (nc === GRAY) return false; // back-edge -> cycle
      if (nc === WHITE) {
        color.set(next, GRAY);
        stack.push({ node: next, index: 0 });
      }
    }
  }
  return true;
}

describe("topology-manager — Property 7: topology is always valid, executable, and honored", () => {
  it("resolveTopology returns a valid, executable, acyclic topology for ANY input", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = resolveTopology(input);
        const roster = new Set(sanitizeRoster(input.participatingRoleIds));

        // (1) Always returns a well-formed topology object.
        expect(result).toBeDefined();
        expect(result.topology).toBeDefined();
        const t = result.topology;
        expect(typeof t).toBe("object");
        expect(Array.isArray(t.critiqueEdges)).toBe(true);

        // (2) Every critique edge endpoint is a session participant (R5.5),
        //     and there are no self-loops.
        for (const edge of t.critiqueEdges) {
          expect(typeof edge.challenger).toBe("string");
          expect(typeof edge.target).toBe("string");
          expect(edge.challenger.length).toBeGreaterThan(0);
          expect(edge.target.length).toBeGreaterThan(0);
          expect(roster.has(edge.challenger)).toBe(true);
          expect(roster.has(edge.target)).toBe(true);
          expect(edge.challenger).not.toBe(edge.target);
        }

        // (3) The resolved critique relation graph is acyclic (so rounds can
        //     converge) — R5.4.
        expect(isAcyclic(t.critiqueEdges)).toBe(true);

        // (4) Executable round bounds: integer, maxRounds >= 1, minRounds <= maxRounds.
        expect(Number.isInteger(t.minRounds)).toBe(true);
        expect(Number.isInteger(t.maxRounds)).toBe(true);
        expect(t.maxRounds).toBeGreaterThanOrEqual(1);
        expect(t.minRounds).toBeLessThanOrEqual(t.maxRounds);
        expect(t.minRounds).toBeGreaterThanOrEqual(1);

        // (5) A synthesizer is always named.
        expect(typeof t.synthesizerRoleId).toBe("string");
        expect(t.synthesizerRoleId.length).toBeGreaterThan(0);

        // (6) Fallback bookkeeping is consistent (R5.4): a recorded reason iff
        //     the default was used; a legal named topology is honored.
        if (result.usedDefault) {
          expect(result.fallbackReason).toBeDefined();
        } else {
          expect(result.fallbackReason).toBeUndefined();
          // Honored: the named topology must have been legal, and its critique
          // edges are passed through verbatim rather than replaced by a fixed
          // all-parallel fan-out (R5.2).
          const named = input.named as BrainstormTopology;
          expect(validateTopology(named, input.participatingRoleIds)).toBeNull();
          expect(t.critiqueEdges).toEqual(named.critiqueEdges);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("an invalid named topology always falls back to a default with a recorded reason", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = resolveTopology(input);
        const reason = input.named
          ? validateTopology(input.named, input.participatingRoleIds)
          : "missing";
        if (reason !== null) {
          expect(result.usedDefault).toBe(true);
          expect(result.fallbackReason).toBeDefined();
          // Falling back yields exactly the default topology shape.
          const expected = buildDefaultTopology(input.participatingRoleIds);
          expect(result.topology.critiqueEdges).toEqual(expected.critiqueEdges);
          expect(result.topology.synthesizerRoleId).toBe(
            expected.synthesizerRoleId,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});
