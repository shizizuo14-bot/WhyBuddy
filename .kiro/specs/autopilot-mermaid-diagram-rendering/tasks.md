# Implementation Plan: Autopilot Mermaid Diagram Rendering

## Overview

This plan implements Mermaid diagram rendering in the Autopilot spec document preview panel. The work is organized into 6 phases: core infrastructure (lazy loader + component), integration with MarkdownRenderer, theme support, error handling, optional fullscreen overlay, and testing.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Phase 1: Core Infrastructure",
      "tasks": ["1.1", "1.2", "1.3"],
      "dependencies": {
        "1.2": ["1.1"],
        "1.3": ["1.2"]
      }
    },
    {
      "name": "Phase 2: Integration",
      "tasks": ["2.1", "2.2"],
      "dependencies": {
        "2.1": ["1.3"],
        "2.2": ["2.1"]
      }
    },
    {
      "name": "Phase 3: Theme Support",
      "tasks": ["3.1", "3.2"],
      "dependencies": {
        "3.1": ["2.1"],
        "3.2": ["3.1"]
      }
    },
    {
      "name": "Phase 4: Error Handling",
      "tasks": ["4.1", "4.2", "4.3"],
      "dependencies": {
        "4.1": ["2.1"],
        "4.2": ["2.1"],
        "4.3": ["2.1"]
      }
    },
    {
      "name": "Phase 5: Fullscreen Overlay (Deferred)",
      "tasks": ["5.1", "5.2"],
      "dependencies": {
        "5.1": ["2.1"],
        "5.2": ["5.1"]
      }
    },
    {
      "name": "Phase 6: Testing",
      "tasks": ["6.1", "6.2", "6.3"],
      "dependencies": {
        "6.1": ["1.2"],
        "6.2": ["1.3"],
        "6.3": ["2.1"]
      }
    }
  ]
}
```

## Tasks

### Phase 1: Core Infrastructure

- [x] 1.1 Add `mermaid` package to dependencies
  - Add `mermaid` (pinned version) to `package.json` dependencies
  - Run `pnpm install` to update lockfile
  - Verify the package resolves correctly

- [x] 1.2 Create `mermaid-loader.ts` lazy loading module
  - Create `client/src/pages/autopilot/right-rail/streaming-doc/mermaid-loader.ts`
  - Implement `getMermaid()` with singleton caching and dynamic import
  - Implement `renderMermaidDiagram(code, theme)` with theme mapping and unique render IDs
  - Set `securityLevel: "strict"` and `startOnLoad: false`
  - Export both functions

- [x] 1.3 Create `MermaidBlock` component
  - Create `client/src/pages/autopilot/right-rail/streaming-doc/MermaidBlock.tsx`
  - Define `MermaidBlockProps` interface with `code`, `isStreaming`, `closed` fields
  - Implement four-state rendering: streaming → loading → rendered → error
  - Use `useTheme()` hook for theme detection
  - Use `useEffect` with cancellation to handle async rendering
  - Render SVG via `dangerouslySetInnerHTML` in a constrained container
  - Show loading skeleton placeholder during library import
  - Show error banner + CodeBlock fallback on parse failure
  - Add `data-testid="mermaid-diagram"` for rendered state
  - Add `data-testid="mermaid-error"` for error state
  - Add `data-testid="mermaid-loading"` for loading state

### Phase 2: Integration

- [x] 2.1 Modify `MarkdownRenderer.tsx` to route mermaid blocks
  - In `renderToken()`, add mermaid detection branch before existing CodeBlock render
  - Use case-insensitive comparison: `token.language?.toLowerCase().trim() === "mermaid"`
  - Route detected mermaid blocks to `MermaidBlock` component
  - Pass `code`, `isStreaming`, and `closed` props
  - Preserve existing CodeBlock rendering for all other code blocks unchanged

- [x] 2.2 Verify streaming compatibility
  - Confirm that unclosed mermaid blocks render as CodeBlock with streaming indicator
  - Confirm that when a streaming block closes, MermaidBlock transitions to render state
  - Test with partial mermaid content during streaming

### Phase 3: Theme Support

- [x] 3.1 Implement theme-reactive rendering
  - Ensure `theme` from `useTheme()` is in the `useEffect` dependency array
  - Verify that theme change triggers re-render of existing diagrams
  - Map `"light"` → mermaid `"default"` theme, `"dark"` → mermaid `"dark"` theme
  - Apply `fontFamily: "var(--font-mono, monospace)"` in mermaid config

- [x] 3.2 Style the diagram container for both themes
  - Light mode: white background, slate-200 border
  - Dark mode: slate-900 background, slate-700 border
  - Ensure SVG text and lines are readable in both modes
  - Constrain diagram width to container with `overflow-x: auto`

### Phase 4: Error Handling and Edge Cases

- [x] 4.1 Handle mermaid parse errors gracefully
  - Catch errors from `mermaid.render()` and display error banner
  - Show the mermaid error message text in the banner
  - Fall back to CodeBlock with the raw mermaid source below the banner
  - Ensure one block's error does not affect other blocks

- [x] 4.2 Handle dynamic import failure
  - Catch errors from `import("mermaid")` in `getMermaid()`
  - Reset `initPromise` on failure to allow retry on next attempt
  - Display "Failed to load diagram renderer" message
  - Fall back to CodeBlock rendering

- [x] 4.3 Handle empty mermaid code blocks
  - Detect empty or whitespace-only code content
  - Display a minimal "Empty diagram" indicator instead of calling mermaid.render()

### Phase 5: Fullscreen Overlay (Deferred / Optional)

- [x] 5.1 Create `MermaidFullscreenOverlay` component
  - Create `client/src/pages/autopilot/right-rail/streaming-doc/MermaidFullscreenOverlay.tsx`
  - Use Radix Dialog for modal overlay
  - Render SVG at natural size with dark backdrop
  - Add close button (top-right) and Escape key dismissal
  - Implement scroll-based zoom via CSS transform
  - Implement pan via overflow auto

- [x] 5.2 Wire fullscreen trigger from MermaidBlock
  - Add click handler on rendered diagram container
  - Manage open/close state for the overlay
  - Pass current SVG HTML to the overlay component
  - Add cursor pointer and hover indicator on diagram container

### Phase 6: Testing

- [x] 6.1 Unit tests for `mermaid-loader.ts`
  - Test that `getMermaid()` returns the mermaid module
  - Test that repeated calls return the same cached module
  - Test that `renderMermaidDiagram()` produces SVG string for valid input
  - Test that `renderMermaidDiagram()` throws for invalid mermaid syntax
  - Test theme parameter mapping (light → default, dark → dark)

- [x] 6.2 Unit tests for `MermaidBlock` component
  - Test streaming state renders CodeBlock
  - Test loading state shows placeholder
  - Test rendered state shows SVG container
  - Test error state shows error banner + CodeBlock
  - Test theme change triggers re-render
  - Test cancellation when code changes during render

- [x] 6.3 Integration tests for `MarkdownRenderer` mermaid routing
  - Test that `language="mermaid"` routes to MermaidBlock
  - Test that `language="Mermaid"` (case-insensitive) routes to MermaidBlock
  - Test that `language="typescript"` still routes to CodeBlock
  - Test that no language annotation routes to CodeBlock
  - Test document with mixed mermaid and non-mermaid blocks
  - Test streaming document with unclosed mermaid block

## Notes

- Phase 5 (Fullscreen Overlay) is marked as deferred and can be implemented in a later iteration without blocking the core feature.
- The `mermaid` package is ~800KB parsed but is loaded lazily via dynamic import, so it does not affect initial bundle size.
- The existing `tokenizeMarkdown()` function and `MarkdownToken` types are NOT modified — the `language` and `closed` fields already provide all information needed for mermaid detection and streaming state.
- All new files are co-located in the existing `streaming-doc/` directory to maintain the current module organization.
