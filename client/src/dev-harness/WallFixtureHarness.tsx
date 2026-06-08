/**
 * Dev-only harness (C renderer-fidelity test).
 *
 * Mounts the REAL `BlueprintWallTexture` head-on in an R3F canvas, driven by a
 * rich structured reasoning-graph fixture, so we can screenshot the renderer
 * ceiling vs the target mind-map image — without login, backend, or LLM.
 *
 * Reachable at /dev-harness/wall (see wall-fixture.html). NOT shipped in prod.
 */

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";

import { BlueprintWallTexture } from "@/components/three/scene-fusion/BlueprintWallTexture";
import {
  BLUEPRINT_WALL_GRAPH_POSITION,
  BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT,
} from "@/components/three/scene-fusion/blueprint-wall-placement";
import type { BlueprintGenerationJob } from "@shared/blueprint/contracts";

import { REASONING_GRAPH_FIXTURE } from "./reasoning-graph-fixture";

export function WallFixtureHarness() {
  const job = useMemo(
    () =>
      ({
        id: REASONING_GRAPH_FIXTURE.jobId,
        stage: "spec_tree",
        status: "running",
        artifacts: [],
      }) as unknown as BlueprintGenerationJob,
    []
  );

  // Head-on camera: same X/Y as the wall plane, pulled straight back on Z so
  // the wall fills the frame without perspective skew.
  const [wx, wy, wz] = BLUEPRINT_WALL_GRAPH_POSITION;
  const camZ = wz + BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT * 1.45;

  return (
    <div
      data-testid="wall-fixture-harness"
      style={{ width: "100vw", height: "100vh", background: "#0b1120" }}
    >
      <Canvas
        orthographic
        camera={{ position: [wx, wy, camZ], zoom: 90, near: 0.01, far: 100 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <ambientLight intensity={1.1} />
        <BlueprintWallTexture
          job={job}
          structuredReasoningGraphs={[REASONING_GRAPH_FIXTURE]}
        />
      </Canvas>
    </div>
  );
}
