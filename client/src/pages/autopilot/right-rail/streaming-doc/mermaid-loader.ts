/**
 * Lazy-loaded Mermaid diagram renderer.
 *
 * Uses dynamic import to avoid including mermaid (~800KB) in the initial bundle.
 * Singleton pattern ensures mermaid is only initialized once.
 */

import type { MermaidConfig } from "mermaid";

let initPromise: Promise<typeof import("mermaid")> | null = null;
let renderCounter = 0;

/**
 * Lazily loads and initializes the mermaid library.
 * Returns the mermaid module. Caches the result for subsequent calls.
 * Resets the cache on failure to allow retry.
 */
export async function getMermaid(): Promise<typeof import("mermaid")> {
  if (!initPromise) {
    initPromise = import("mermaid")
      .then((mod) => {
        mod.default.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          fontFamily: "var(--font-mono, monospace)",
        } satisfies MermaidConfig);
        return mod;
      })
      .catch((err) => {
        initPromise = null; // Reset to allow retry
        throw err;
      });
  }
  return initPromise;
}

/**
 * Renders a mermaid diagram to SVG string.
 *
 * @param code - The mermaid diagram source code
 * @param theme - "light" or "dark", mapped to mermaid themes
 * @returns The rendered SVG string
 * @throws If the mermaid code is invalid
 */
export async function renderMermaidDiagram(
  code: string,
  theme: "light" | "dark" = "light",
): Promise<string> {
  const mermaidModule = await getMermaid();
  const mermaid = mermaidModule.default;

  // Map app theme to mermaid theme
  const mermaidTheme = theme === "dark" ? "dark" : "default";

  // Re-initialize with current theme (mermaid requires this for theme changes)
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: mermaidTheme,
    fontFamily: "var(--font-mono, monospace)",
  });

  // Use unique ID to avoid DOM conflicts
  const id = `mermaid-diagram-${++renderCounter}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}
