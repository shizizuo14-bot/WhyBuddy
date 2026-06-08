/**
 * Dev-only entry for the wall renderer-fidelity harness (C).
 *
 * Reachable at /wall-fixture.html under `vite dev`. Renders the REAL
 * `BlueprintWallTexture` head-on, driven by a rich structured fixture, so we
 * can screenshot the renderer ceiling vs the target mind-map image. NOT prod.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { WallFixtureHarness } from "./WallFixtureHarness";

const container = document.getElementById("wall-fixture-root");
if (!container) {
  throw new Error("wall-fixture-root container missing");
}

createRoot(container).render(
  <StrictMode>
    <WallFixtureHarness />
  </StrictMode>
);
