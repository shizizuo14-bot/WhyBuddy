# Requirements Document

## Introduction

This feature adds Mermaid diagram rendering support to the Autopilot spec document preview panel. Currently, code blocks marked with ` ```mermaid ` in generated spec documents (requirements, design, tasks) are displayed as raw text. This enhancement renders those blocks as interactive SVG diagrams inline within the document preview, enabling users to visually understand architecture relationships, data flows, and sequence interactions without reading raw Mermaid syntax.

The rendering is purely a frontend enhancement within the `StreamingDocRenderer` / `MarkdownRenderer` pipeline. It does not require backend changes, does not alter the spec document data model, and does not affect non-mermaid code blocks.

## Glossary

- **Mermaid_Renderer**: The frontend component responsible for detecting mermaid code blocks and rendering them as SVG diagrams using the mermaid-js library.
- **Document_Preview_Panel**: The right-rail panel in the Autopilot page that displays streaming spec document content via `StreamingDocRenderer` and `MarkdownRenderer`.
- **Code_Block_Detector**: The tokenization logic within `MarkdownRenderer.tokenizeMarkdown()` that identifies fenced code blocks and their language annotations.
- **Mermaid_Library**: The `mermaid` npm package that parses Mermaid diagram syntax and produces SVG output in the browser.
- **Fallback_Display**: The alternative rendering shown when Mermaid parsing fails, consisting of the raw code block with a parse error indicator.
- **Theme_Adapter**: The logic that configures the Mermaid rendering theme to match the current panel background (dark or light mode).
- **Diagram_Fullscreen_Overlay**: An optional modal overlay that displays a rendered diagram at full viewport size for detailed inspection.

## Requirements

### Requirement 1: Mermaid Code Block Detection

**User Story:** As a user viewing spec documents, I want mermaid code blocks to be identified separately from regular code blocks, so that they can be rendered as diagrams instead of raw text.

#### Acceptance Criteria

1. WHEN a fenced code block with language annotation `mermaid` is encountered during tokenization, THE Code_Block_Detector SHALL classify the token as a mermaid diagram block.
2. WHEN a fenced code block has a language annotation other than `mermaid`, THE Code_Block_Detector SHALL continue to classify the token as a regular code block.
3. WHEN a fenced code block has no language annotation, THE Code_Block_Detector SHALL classify the token as a regular code block.
4. THE Code_Block_Detector SHALL perform case-insensitive matching on the language annotation when checking for `mermaid`.

### Requirement 2: Mermaid SVG Rendering

**User Story:** As a user viewing spec documents, I want mermaid diagram blocks to be rendered as SVG diagrams, so that I can visually understand architecture and data flow relationships.

#### Acceptance Criteria

1. WHEN a mermaid diagram block is detected, THE Mermaid_Renderer SHALL invoke the Mermaid_Library to parse the diagram syntax and produce an SVG element.
2. WHEN the Mermaid_Library produces a valid SVG, THE Mermaid_Renderer SHALL display the SVG inline within the document flow at the position of the original code block.
3. THE Mermaid_Renderer SHALL support `sequenceDiagram`, `flowchart`, `classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, `pie`, `graph`, and `gitgraph` diagram types.
4. WHEN the SVG is rendered, THE Mermaid_Renderer SHALL constrain the diagram width to the available container width and allow vertical overflow with scrolling.

### Requirement 3: Rendering Failure Fallback

**User Story:** As a user viewing spec documents with malformed mermaid syntax, I want to see the raw code with an error indicator, so that I can still read the diagram source and understand what was intended.

#### Acceptance Criteria

1. IF the Mermaid_Library fails to parse the diagram syntax, THEN THE Mermaid_Renderer SHALL display the raw mermaid source code using the existing CodeBlock component.
2. IF the Mermaid_Library fails to parse the diagram syntax, THEN THE Mermaid_Renderer SHALL display a visible error indicator above the raw code block stating that diagram rendering failed.
3. IF the Mermaid_Library fails to parse the diagram syntax, THEN THE Fallback_Display SHALL include the error message returned by the Mermaid_Library to aid debugging.

### Requirement 4: Dark and Light Theme Support

**User Story:** As a user working in either dark or light mode, I want rendered diagrams to match the panel background theme, so that diagrams remain readable and visually consistent.

#### Acceptance Criteria

1. WHILE the Document_Preview_Panel is in light mode, THE Theme_Adapter SHALL configure the Mermaid_Library to use a light theme with dark text and lines.
2. WHILE the Document_Preview_Panel is in dark mode, THE Theme_Adapter SHALL configure the Mermaid_Library to use a dark theme with light text and lines.
3. WHEN the user switches between dark and light mode, THE Theme_Adapter SHALL re-render existing mermaid diagrams with the updated theme configuration.

### Requirement 5: Lazy Loading of Mermaid Library

**User Story:** As a user of the application, I want the mermaid rendering library to be loaded only when needed, so that the initial page load performance is not degraded.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL load the Mermaid_Library via dynamic import only when the first mermaid code block is encountered in the document.
2. THE Mermaid_Renderer SHALL NOT include the Mermaid_Library in the application's initial JavaScript bundle.
3. WHILE the Mermaid_Library is loading, THE Mermaid_Renderer SHALL display a loading placeholder at the position of the mermaid code block.
4. IF the dynamic import of the Mermaid_Library fails, THEN THE Mermaid_Renderer SHALL fall back to displaying the raw code block using the existing CodeBlock component.

### Requirement 6: Non-Mermaid Code Block Preservation

**User Story:** As a user viewing spec documents, I want non-mermaid code blocks to continue rendering as syntax-highlighted code, so that existing document display behavior is unchanged.

#### Acceptance Criteria

1. THE Document_Preview_Panel SHALL render code blocks with language annotations other than `mermaid` using the existing CodeBlock component without modification.
2. THE Document_Preview_Panel SHALL render code blocks without language annotations using the existing CodeBlock component without modification.
3. WHEN a document contains both mermaid and non-mermaid code blocks, THE Document_Preview_Panel SHALL render each block according to its type independently.

### Requirement 7: Streaming Compatibility

**User Story:** As a user viewing a spec document that is still being generated (streaming), I want mermaid diagrams to render correctly once the code block is complete, so that I see diagrams appear naturally during generation.

#### Acceptance Criteria

1. WHILE a mermaid code block is still being streamed (not yet closed with closing fence), THE Mermaid_Renderer SHALL display the partial content as raw code using the existing CodeBlock component with streaming indicator.
2. WHEN a mermaid code block becomes fully closed during streaming, THE Mermaid_Renderer SHALL attempt to render the complete diagram as SVG.
3. IF a previously streaming mermaid code block transitions to closed state, THEN THE Mermaid_Renderer SHALL replace the raw code display with the rendered SVG diagram.

### Requirement 8: Diagram Fullscreen View (Optional / Deferred)

**User Story:** As a user viewing a complex diagram, I want to expand it to full screen, so that I can inspect details that are hard to read at inline size.

#### Acceptance Criteria

1. WHEN a rendered mermaid diagram is clicked, THE Mermaid_Renderer SHALL open the Diagram_Fullscreen_Overlay displaying the diagram at full viewport size.
2. WHEN the Diagram_Fullscreen_Overlay is open, THE Diagram_Fullscreen_Overlay SHALL provide a close button to dismiss the overlay and return to the inline view.
3. WHILE the Diagram_Fullscreen_Overlay is open, THE Diagram_Fullscreen_Overlay SHALL allow pan and zoom interactions on the SVG diagram.
