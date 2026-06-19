/**
 * Node thin proxy -> Python delegation smoke.
 *
 * Default mode is CI/local safe: the test starts a tiny Python-shaped HTTP
 * service inside the test process, then exercises the real Node router and the
 * real callPythonSlideRule path. Set LIVE_NODE_TO_PYTHON_SLIDERULE=1 to point
 * at an already running Python service instead.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';

const LIVE_FLAG = 'LIVE_NODE_TO_PYTHON_SLIDERULE';
const DEFAULT_INTERNAL_KEY = 'dev-slide-rule-internal';

type PythonReply = {
  title: string;
  summary: string;
  content: string;
  provenance: string;
  model: string;
  usage: { total_tokens: number };
};

async function closeServer(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('server did not expose a TCP address');
  }
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function replyFor(capabilityId: string): PythonReply {
  if (capabilityId === 'report.write') {
    return {
      title: 'Feasibility report',
      summary: 'Python report smoke',
      content: [
        '结论：pet office report is feasible',
        '支撑证据：desk assignment smoke evidence',
        '风险：progression may feel grindy',
        '收敛决策：prototype the first desk loop',
        'provenance / upstream refs：node-delegation-smoke',
      ].join('\n'),
      provenance: 'python-llm',
      model: 'fake-python-report',
      usage: { total_tokens: 90 },
    };
  }

  if (capabilityId === 'handoff.package') {
    return {
      title: 'Engineering handoff package',
      summary: 'Python handoff smoke',
      content: [
        '## Report bundle',
        '- report.md captures the delivery decision.',
        '## Traceability matrix bundle',
        '- matrix links requirement, evidence, risk, and decision.',
        '## Visual preview bundle',
        '- visual preview includes provenance notes.',
        '## Next steps',
        '- assign owner and rerun gate.',
      ].join('\n'),
      provenance: 'python-llm',
      model: 'fake-python-handoff',
      usage: { total_tokens: 55 },
    };
  }

  return {
    title: 'Intent clarification',
    summary: 'Python dialogue smoke',
    content: [
      '## Restated goal',
      '- Clarify pet office onboarding decisions.',
      '## Open questions',
      '- Which first desk state should unlock task assignment?',
    ].join('\n'),
    provenance: 'python-llm',
    model: 'fake-python-dialogue',
    usage: { total_tokens: 21 },
  };
}

async function startFakePythonService(): Promise<{ server: Server; baseUrl: string; calls: unknown[] }> {
  const calls: unknown[] = [];
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', backend: 'fake-python-sliderule' });
  });
  app.post('/api/sliderule/execute-capability', (req, res) => {
    if (req.header('X-Internal-Key') !== DEFAULT_INTERNAL_KEY) {
      res.status(403).json({ error: 'invalid internal key' });
      return;
    }
    calls.push(req.body);
    res.json(replyFor(String(req.body?.capabilityId || '')));
  });
  const server = await listen(app);
  return { ...server, calls };
}

async function startNodeRouter(pythonBaseUrl: string): Promise<{ server: Server; baseUrl: string }> {
  vi.stubEnv('SLIDERULE_V5_BACKEND', 'python');
  vi.stubEnv('PYTHON_SLIDE_RULE_BASE_URL', pythonBaseUrl);
  vi.stubEnv('PYTHON_SLIDE_RULE_INTERNAL_KEY', DEFAULT_INTERNAL_KEY);

  const { default: liveRouter } = await import('../sliderule.js');
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/sliderule', liveRouter);
  return listen(app);
}

async function postCapability(baseUrl: string, capabilityId: string, goal: string) {
  return fetch(`${baseUrl}/api/sliderule/execute-capability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilityId,
      state: { sessionId: `smoke-${capabilityId}`, goal: { text: goal }, artifacts: [] },
      inputArtifactIds: [],
      roleId: 'agent',
      turnId: `smoke-${capabilityId}`,
      userText: goal,
    }),
  });
}

describe('Node -> Python delegation smoke', () => {
  let fakePython: { server: Server; baseUrl: string; calls: unknown[] } | undefined;
  let nodeRouter: { server: Server; baseUrl: string } | undefined;

  afterEach(async () => {
    await closeServer(nodeRouter?.server);
    await closeServer(fakePython?.server);
    nodeRouter = undefined;
    fakePython = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('delegates dialogue, report, and handoff through real Node proxy without Node LLM/pool', async () => {
    const pythonBaseUrl = process.env[LIVE_FLAG] === '1'
      ? (process.env.PYTHON_SLIDE_RULE_BASE_URL || 'http://localhost:9700')
      : undefined;

    if (!pythonBaseUrl) {
      fakePython = await startFakePythonService();
    }

    nodeRouter = await startNodeRouter(pythonBaseUrl || fakePython!.baseUrl);

    const llmClient = await import('../../core/llm-client.js');
    const poolJsonLlm = await import('../../sliderule/pool-json-llm.js');
    const primarySpy = vi.spyOn(llmClient as any, 'callLLMJsonWithUsage');
    const poolSpy = vi.spyOn(poolJsonLlm as any, 'callPoolJsonLlm');

    const cases = [
      {
        capabilityId: 'intent.clarify',
        goal: 'clarify pet office onboarding',
        expected: 'Restated goal',
      },
      {
        capabilityId: 'report.write',
        goal: 'write pet office feasibility report',
        expected: '支撑证据',
      },
      {
        capabilityId: 'handoff.package',
        goal: 'handoff pet office delivery',
        expected: 'Next steps',
      },
    ];

    for (const item of cases) {
      const response = await postCapability(nodeRouter.baseUrl, item.capabilityId, item.goal);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.provenance).toBe('python-llm');
      expect(String(body.content || '')).toContain(item.expected);
    }

    expect(primarySpy).not.toHaveBeenCalled();
    expect(poolSpy).not.toHaveBeenCalled();

    if (fakePython) {
      expect(fakePython.calls).toHaveLength(3);
      expect(fakePython.calls).toEqual([
        expect.objectContaining({ capabilityId: 'intent.clarify' }),
        expect.objectContaining({ capabilityId: 'report.write' }),
        expect.objectContaining({ capabilityId: 'handoff.package' }),
      ]);
    }
  }, 60000);
});
