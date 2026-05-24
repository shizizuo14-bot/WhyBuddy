import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  buildWorkflowDirectiveContext,
  type WorkflowInputAttachment,
  type WorkflowAttachmentExcerptStatus,
} from '../../shared/workflow-input.js';

/* ─── Arbitraries ─── */

const arbExcerptStatus: fc.Arbitrary<WorkflowAttachmentExcerptStatus> = fc.constantFrom(
  'parsed',
  'truncated',
  'metadata_only',
  'vision_analyzed',
  'vision_fallback',
);

const arbAttachmentBase = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  mimeType: fc.string({ minLength: 1, maxLength: 40 }),
  size: fc.nat({ max: 10_000_000 }),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  excerpt: fc.string({ minLength: 1, maxLength: 200 }),
  excerptStatus: arbExcerptStatus,
});

const arbVisualDescription = fc.string({ minLength: 1, maxLength: 300 });

const arbAttachmentWithVision: fc.Arbitrary<WorkflowInputAttachment> = arbAttachmentBase.chain(
  (base) =>
    arbVisualDescription.map((desc) => ({
      ...base,
      visionReady: true,
      visualDescription: desc,
    })),
);

const arbAttachmentWithoutVision: fc.Arbitrary<WorkflowInputAttachment> = arbAttachmentBase.map(
  (base) => ({ ...base }),
);

const arbAttachment: fc.Arbitrary<WorkflowInputAttachment> = fc.oneof(
  arbAttachmentWithVision,
  arbAttachmentWithoutVision,
);

const arbDirective = fc.string({ minLength: 1, maxLength: 200 });

function buildNonVisionName(index: number, visionNames: Set<string>): string {
  let suffix = 0;
  while (true) {
    const candidate = `__without_vision_${index}_${suffix}__`;
    if (![...visionNames].some((name) => name.startsWith(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}

/* ─── Property 8: 指令上下文包含视觉分析 ─── */
/* **Validates: Requirements 4.3** */

describe('Feature: multi-modal-vision, Property 8: 指令上下文包含视觉分析', () => {
  it('output contains "[Vision Analysis] {name}" and visualDescription for each attachment with visualDescription', () => {
    fc.assert(
      fc.property(
        arbDirective,
        fc.array(arbAttachment, { minLength: 1, maxLength: 4 }),
        (directive, attachments) => {
          const result = buildWorkflowDirectiveContext(directive, attachments);

          for (const att of attachments) {
            if (att.visualDescription) {
              expect(result).toContain(`[Vision Analysis] ${att.name}`);
              expect(result).toContain(att.visualDescription);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('output does NOT contain "[Vision Analysis] {name}" for attachments without visualDescription', () => {
    fc.assert(
      fc.property(
        arbDirective,
        fc.array(arbAttachmentWithoutVision, { minLength: 1, maxLength: 4 }),
        (directive, attachments) => {
          const result = buildWorkflowDirectiveContext(directive, attachments);

          for (const att of attachments) {
            expect(result).not.toContain(`[Vision Analysis] ${att.name}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('mixed attachments: only those with visualDescription get "[Vision Analysis]" markers', () => {
    fc.assert(
      fc.property(
        arbDirective,
        fc.array(arbAttachmentWithVision, { minLength: 1, maxLength: 2 }),
        fc.array(arbAttachmentWithoutVision, { minLength: 1, maxLength: 2 }),
        (directive, withVision, withoutVision) => {
          // Ensure non-vision attachment names are unique and don't collide
          // with vision attachment marker prefixes (prefix matches cause false positives)
          const visionNames = new Set(withVision.map((a) => a.name.trim()));
          const safeWithoutVision = withoutVision.map((att, i) => ({
            ...att,
            name: buildNonVisionName(i, visionNames),
          }));

          const attachments = [...withVision, ...safeWithoutVision];
          const result = buildWorkflowDirectiveContext(directive, attachments);

          for (const att of withVision) {
            expect(result).toContain(`[Vision Analysis] ${att.name}`);
            expect(result).toContain(att.visualDescription!);
          }

          for (const att of safeWithoutVision) {
            expect(result).not.toContain(`[Vision Analysis] ${att.name}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
