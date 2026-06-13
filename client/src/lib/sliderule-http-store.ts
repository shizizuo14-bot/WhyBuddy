import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";
import type { SlideRuleSessionStore } from "./sliderule-runtime";

/**
 * HttpSlideRuleSessionStore — productionization adapter skeleton.
 *
 * Implements the shared SlideRuleSessionStore contract over HTTP.
 * Talks to the 4 endpoints the user specified:
 *   GET    /api/sliderule/sessions
 *   GET    /api/sliderule/sessions/:sessionId
 *   PUT    /api/sliderule/sessions/:sessionId
 *   DELETE /api/sliderule/sessions/:sessionId
 *
 * Default base is relative "/api/sliderule" so that:
 * - In browser (with vite proxy or full server) it just works.
 * - In tests / pure in-mem usage we never instantiate this unless explicitly asked.
 *
 * The server-side implementation (server/routes/sliderule.ts) is a minimal
 * in-memory Map (no real DB). This is intentional per the "骨架" request.
 *
 * Usage (when you want to opt into remote/persistent for a demo):
 *   import { HttpSlideRuleSessionStore } from "@/lib/sliderule-http-store";
 *   import { setSlideRuleSessionStore } from "@/lib/sliderule-runtime";
 *   setSlideRuleSessionStore(new HttpSlideRuleSessionStore());
 *
 * All load/save in the runtime + page are now async, so callers await.
 */
export class HttpSlideRuleSessionStore implements SlideRuleSessionStore {
  private readonly base: string;

  constructor(baseUrl = "/api/sliderule") {
    // normalize: ensure no trailing slash before we append /sessions...
    this.base = baseUrl.replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  async load(sessionId: string): Promise<V5SessionState | undefined> {
    const res = await fetch(this.url(`/sessions/${encodeURIComponent(sessionId)}`), {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HttpSlideRuleSessionStore.load failed: ${res.status} ${text}`);
    }
    return (await res.json()) as V5SessionState;
  }

  async save(state: V5SessionState): Promise<V5SessionState> {
    const sid = state.sessionId || "sliderule-local-proto";
    const res = await fetch(this.url(`/sessions/${encodeURIComponent(sid)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HttpSlideRuleSessionStore.save failed: ${res.status} ${text}`);
    }
    return (await res.json()) as V5SessionState;
  }

  async listSessions(): Promise<Array<{
    sessionId: string;
    goal: string;
    createdAt?: string;
    lastActive?: string;
    artifactCount: number;
    phase?: string;
  }>> {
    const res = await fetch(this.url(`/sessions`), {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HttpSlideRuleSessionStore.listSessions failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    // Accept both { sessions: [...] } and raw array shapes for flexibility
    return (data && data.sessions ? data.sessions : data) || [];
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(this.url(`/sessions/${encodeURIComponent(sessionId)}`), {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      throw new Error(`HttpSlideRuleSessionStore.deleteSession failed: ${res.status} ${text}`);
    }
  }
}

/**
 * Convenience factory (matches the "createHttp..." naming users expect for adapters).
 */
export function createHttpSlideRuleSessionStore(baseUrl?: string): SlideRuleSessionStore {
  return new HttpSlideRuleSessionStore(baseUrl);
}

export default HttpSlideRuleSessionStore;
