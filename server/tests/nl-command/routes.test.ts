/**
 * REST API route unit tests for NL Command Center
 *
 * Tests request validation and error responses for key endpoints.
 * Since supertest is not installed, we create a minimal Express app
 * and use Node's built-in http module to make requests.
 *
 * Requirements: all API-related requirements
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createNLCommandRouter } from '../../routes/nl-command.js';

// ─── Test helpers ───

let server: http.Server;
let baseUrl: string;

function request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 500, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Setup / Teardown ───

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/nl-command', createNLCommandRouter({
    previewClarificationQuestions: async (payload) => ({
      needsClarification: true,
      questions: [
        {
          questionId: 'preview-1',
          text:
            payload.locale === 'en-US'
              ? 'Which delivery window should we target?'
              : '这次希望按哪个交付窗口推进？',
          type: 'single_choice',
          options:
            payload.locale === 'en-US'
              ? ['today', 'this week', 'flexible']
              : ['今天内', '本周内', '可弹性安排'],
          context:
            payload.locale === 'en-US'
              ? 'Used to avoid guessing the deadline.'
              : '用于避免系统自行猜测截止时间。',
        },
      ],
    }),
    recommendedCommandsService: {
      async listSuggestions(planId) {
        return {
          suggestions: [
            {
              suggestionId: 'sug-cost-1',
              type: 'cost',
              title: `收敛 ${planId} 成本`,
              description: '优先降低高成本任务的模型与执行开销。',
              estimatedImpact: {
                timelineImpact: '默认保持当前节奏',
                costImpact: '预计节省 12% 成本',
                riskImpact: '需要确认质量门槛不下降',
              },
              changes: [
                {
                  entityId: 'task-1',
                  entityType: 'task',
                  field: 'estimatedCost',
                  oldValue: 100,
                  newValue: 88,
                },
              ],
              source: 'decision_support',
              rationale: '来自 recommendation lane 的最小测试闭环。',
              recommendedCommand: `apply_suggestion --plan ${planId} --suggestion sug-cost-1`,
              selectionOption: {
                optionId: 'sug-cost-1',
                suggestionId: 'sug-cost-1',
                label: `收敛 ${planId} 成本`,
                description: '优先降低高成本任务的模型与执行开销。',
                action: 'multi-choice',
              },
              confirmOption: {
                optionId: 'confirm:sug-cost-1',
                suggestionId: 'sug-cost-1',
                label: `采纳：收敛 ${planId} 成本`,
                description: '来自 recommendation lane 的最小测试闭环。',
                action: 'approve',
              },
            },
          ],
          selectionOptions: [
            {
              optionId: 'sug-cost-1',
              suggestionId: 'sug-cost-1',
              label: `收敛 ${planId} 成本`,
              description: '优先降低高成本任务的模型与执行开销。',
              action: 'multi-choice',
            },
          ],
          confirmPayload: {
            prompt: `请确认是否采纳计划 ${planId} 的推荐命令。`,
            branchKeyField: 'suggestionId',
            defaultSuggestionId: 'sug-cost-1',
            options: [
              {
                optionId: 'confirm:sug-cost-1',
                suggestionId: 'sug-cost-1',
                label: `采纳：收敛 ${planId} 成本`,
                description: '来自 recommendation lane 的最小测试闭环。',
                action: 'approve',
              },
            ],
          },
          observability: {
            generatedEventId: 'audit-generated-1',
            generatedAt: 1710000000000,
            source: 'decision_support',
          },
        };
      },
      async applySuggestion(planId, request) {
        if (planId !== 'plan-1' || request.suggestionId !== 'sug-cost-1') {
          return null;
        }

        return {
          adjustment: {
            adjustmentId: 'adj-1',
            planId,
            reason: '采纳推荐命令：收敛 plan-1 成本',
            changes: [
              {
                entityId: 'task-1',
                entityType: 'task',
                field: 'estimatedCost',
                oldValue: 100,
                newValue: 88,
              },
            ],
            impact: {
              timelineImpact: '默认保持当前节奏',
              costImpact: '预计节省 12% 成本',
              riskImpact: '需要确认质量门槛不下降',
            },
            approvalRequired: false,
            status: 'applied',
            createdAt: 1710000001000,
          },
          appliedSuggestion: {
            suggestionId: 'sug-cost-1',
            type: 'cost',
            title: '收敛 plan-1 成本',
            description: '优先降低高成本任务的模型与执行开销。',
            estimatedImpact: {
              timelineImpact: '默认保持当前节奏',
              costImpact: '预计节省 12% 成本',
              riskImpact: '需要确认质量门槛不下降',
            },
            changes: [
              {
                entityId: 'task-1',
                entityType: 'task',
                field: 'estimatedCost',
                oldValue: 100,
                newValue: 88,
              },
            ],
            source: 'decision_support',
            rationale: '来自 recommendation lane 的最小测试闭环。',
            recommendedCommand: 'apply_suggestion --plan plan-1 --suggestion sug-cost-1',
          },
          audit: {
            suggestionAppliedEntryId: 'audit-applied-1',
          },
        };
      },
    },
  }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// ─── Tests ───

describe('NL Command Center REST API routes', () => {
  describe('POST /api/nl-command/clarification-preview', () => {
    it('should return 400 when commandText is missing', async () => {
      const res = await request('POST', '/api/nl-command/clarification-preview', {
        userId: 'u1',
      });
      expect(res.status).toBe(400);
    });

    it('should return generated clarification questions for valid requests', async () => {
      const res = await request('POST', '/api/nl-command/clarification-preview', {
        commandText: '整理支付模块发布方案',
        userId: 'u1',
        locale: 'zh-CN',
      });

      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).needsClarification).toBe(true);
      expect(((res.body as { questions?: unknown[] }).questions ?? []).length).toBe(1);
    });
  });

  // ─── POST /api/nl-command/commands ───

  describe('POST /api/nl-command/commands', () => {
    it('should return 400 when commandText is missing', async () => {
      const res = await request('POST', '/api/nl-command/commands', { userId: 'u1' });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe('Bad request');
    });

    it('should return 400 when userId is missing', async () => {
      const res = await request('POST', '/api/nl-command/commands', { commandText: 'do something' });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe('Bad request');
    });

    it('should return 400 when body is empty', async () => {
      const res = await request('POST', '/api/nl-command/commands', {});
      expect(res.status).toBe(400);
    });

    it('should accept valid request and return 501 (not yet integrated)', async () => {
      const res = await request('POST', '/api/nl-command/commands', {
        commandText: 'Refactor payment module',
        userId: 'user-1',
      });
      expect(res.status).toBe(501);
      expect((res.body as Record<string, unknown>).endpoint).toBe('POST /commands');
    });
  });

  // ─── GET /api/nl-command/commands ───

  describe('GET /api/nl-command/commands', () => {
    it('should return 501 (not yet integrated)', async () => {
      const res = await request('GET', '/api/nl-command/commands');
      expect(res.status).toBe(501);
    });
  });

  // ─── GET /api/nl-command/commands/:id ───

  describe('GET /api/nl-command/commands/:id', () => {
    it('should return 501 for a valid command ID', async () => {
      const res = await request('GET', '/api/nl-command/commands/cmd-123');
      expect(res.status).toBe(501);
      expect((res.body as Record<string, unknown>).endpoint).toBe('GET /commands/:id');
    });
  });

  // ─── POST /api/nl-command/commands/:id/clarify ───

  describe('POST /api/nl-command/commands/:id/clarify', () => {
    it('should return 400 when answer is missing', async () => {
      const res = await request('POST', '/api/nl-command/commands/cmd-1/clarify', {});
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).message).toContain('questionId');
    });

    it('should return 400 when answer.questionId is missing', async () => {
      const res = await request('POST', '/api/nl-command/commands/cmd-1/clarify', {
        answer: { text: 'some answer' },
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid clarification and return 501', async () => {
      const res = await request('POST', '/api/nl-command/commands/cmd-1/clarify', {
        answer: { questionId: 'q-1', text: 'Yes, zero downtime' },
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── GET /api/nl-command/audit ───

  describe('GET /api/nl-command/audit', () => {
    it('should return 501 (not yet integrated)', async () => {
      const res = await request('GET', '/api/nl-command/audit');
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/comments ───

  describe('POST /api/nl-command/comments', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request('POST', '/api/nl-command/comments', { content: 'hello' });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).message).toContain('entityId');
    });

    it('should accept valid comment and return 501', async () => {
      const res = await request('POST', '/api/nl-command/comments', {
        entityId: 'mission-1',
        entityType: 'mission',
        authorId: 'user-1',
        content: 'Looks good',
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── GET /api/nl-command/comments ───

  describe('GET /api/nl-command/comments', () => {
    it('should return 400 when entityId query param is missing', async () => {
      const res = await request('GET', '/api/nl-command/comments');
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).message).toContain('entityId');
    });

    it('should return 501 when entityId is provided', async () => {
      const res = await request('GET', '/api/nl-command/comments?entityId=mission-1');
      expect(res.status).toBe(501);
    });
  });

  // ─── GET /api/nl-command/templates ───

  describe('GET /api/nl-command/templates', () => {
    it('should return 501 (not yet integrated)', async () => {
      const res = await request('GET', '/api/nl-command/templates');
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/templates ───

  describe('POST /api/nl-command/templates', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request('POST', '/api/nl-command/templates', { name: 'My Template' });
      expect(res.status).toBe(400);
    });

    it('should accept valid template save and return 501', async () => {
      const res = await request('POST', '/api/nl-command/templates', {
        planId: 'plan-1',
        name: 'My Template',
        description: 'A reusable plan',
        createdBy: 'user-1',
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/plans/:id/approve ───

  describe('POST /api/nl-command/plans/:id/approve', () => {
    it('should return 400 when approverId is missing', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/approve', {
        decision: 'approved',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when decision is missing', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/approve', {
        approverId: 'user-1',
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid approval and return 501', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/approve', {
        approverId: 'user-1',
        decision: 'approved',
        comments: 'LGTM',
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/plans/:id/adjust ───

  describe('POST /api/nl-command/plans/:id/adjust', () => {
    it('should return 400 when reason is missing', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/adjust', {
        changes: [],
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when changes is not an array', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/adjust', {
        reason: 'timeline shift',
        changes: 'not-an-array',
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid adjustment and return 501', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/adjust', {
        reason: 'Timeline needs extension',
        changes: [{ entityId: 't-1', entityType: 'task', field: 'duration', oldValue: 60, newValue: 120 }],
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/alerts/rules ───

  describe('GET /api/nl-command/plans/:id/suggestions', () => {
    it('should return recommended commands with selection and confirmation payloads', async () => {
      const res = await request('GET', '/api/nl-command/plans/plan-1/suggestions');

      expect(res.status).toBe(200);
      expect(((res.body as { suggestions?: unknown[] }).suggestions ?? []).length).toBe(1);
      expect((res.body as Record<string, any>).selectionOptions?.[0]?.suggestionId).toBe('sug-cost-1');
      expect((res.body as Record<string, any>).confirmPayload?.branchKeyField).toBe('suggestionId');
      expect((res.body as Record<string, any>).observability?.generatedEventId).toBe('audit-generated-1');
    });
  });

  describe('POST /api/nl-command/plans/:id/apply-suggestion', () => {
    it('should apply a known suggestion', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/apply-suggestion', {
        suggestionId: 'sug-cost-1',
        operator: 'user-1',
      });

      expect(res.status).toBe(200);
      expect((res.body as Record<string, any>).adjustment?.status).toBe('applied');
      expect((res.body as Record<string, any>).appliedSuggestion?.suggestionId).toBe('sug-cost-1');
      expect((res.body as Record<string, any>).audit?.suggestionAppliedEntryId).toBe('audit-applied-1');
    });

    it('should return 404 when suggestion is not found', async () => {
      const res = await request('POST', '/api/nl-command/plans/plan-1/apply-suggestion', {
        suggestionId: 'missing-suggestion',
      });

      expect(res.status).toBe(404);
      expect((res.body as Record<string, unknown>).error).toBe('Not found');
    });
  });

  describe('GET /api/nl-command/plans/:id/suggestions', () => {
    it('should return 400 when plan id is missing', async () => {
      const res = await request('GET', '/api/nl-command/plans//suggestions');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/nl-command/alerts/rules', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request('POST', '/api/nl-command/alerts/rules', { type: 'COST_EXCEEDED' });
      expect(res.status).toBe(400);
    });

    it('should accept valid alert rule and return 501', async () => {
      const res = await request('POST', '/api/nl-command/alerts/rules', {
        type: 'COST_EXCEEDED',
        condition: { metric: 'cost', operator: 'gt', threshold: 1000 },
        priority: 'warning',
      });
      expect(res.status).toBe(501);
    });
  });

  // ─── POST /api/nl-command/audit/export ───

  describe('POST /api/nl-command/audit/export', () => {
    it('should return 400 when filter or format is missing', async () => {
      const res = await request('POST', '/api/nl-command/audit/export', { filter: {} });
      expect(res.status).toBe(400);
    });

    it('should accept valid export request and return 501', async () => {
      const res = await request('POST', '/api/nl-command/audit/export', {
        filter: { operator: 'admin' },
        format: 'json',
      });
      expect(res.status).toBe(501);
    });
  });
});
