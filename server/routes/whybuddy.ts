/**
 * WhyBuddy V5 Session Store HTTP API (pilot durable).
 *
 * Provides the 4 endpoints (surface 100% unchanged from skeleton):
 *   GET    /api/whybuddy/sessions           -> list
 *   GET    /api/whybuddy/sessions/:sessionId -> load one
 *   PUT    /api/whybuddy/sessions/:sessionId -> save (upsert)
 *   DELETE /api/whybuddy/sessions/:sessionId -> delete
 *
 * Now backed by durable JSON file (data/whybuddy-sessions.json) for the Durable Store Pilot.
 * In-memory Map is a hot cache only. Every mutate flushes to disk (atomic tmp+rename).
 * Loads from disk at module init. Re-init / reload-from-disk supported for smoke/tests only.
 *
 * HTTP surface + client HttpWhyBuddySessionStore contract remain identical and swappable.
 * (tsx watch on server/ files will pick up changes live.)
 */

import express, { Router, type Request, type Response } from "express";
import type { V5SessionState } from "../../shared/blueprint/v5-reasoning-state.js";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// Durable file-backed pilot store.
// - DATA_FILE lives under data/ (already broadly gitignored for runtime artifacts).
// - Map is hot cache for speed + simple list/GET shaping.
// - loadFromDisk at init; flushToDisk after every mutate (set/delete/clear).
// - Atomic write: write .tmp then renameSync.
const DATA_FILE = path.resolve(process.cwd(), "data", "whybuddy-sessions.json");

const sessions = new Map<string, V5SessionState>();

function loadFromDisk(): void {
  try {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const arr: Array<[string, V5SessionState]> = raw ? JSON.parse(raw) : [];
      sessions.clear();
      for (const [k, v] of arr) {
        if (k && v) sessions.set(k, v);
      }
    }
  } catch (e) {
    // Pilot: never crash the server on bad/partial file; start empty and let next flush repair.
    console.error("[whybuddy-store] loadFromDisk failed (starting empty):", (e as Error)?.message || e);
  }
}

function flushToDisk(): void {
  try {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    const payload = JSON.stringify(Array.from(sessions.entries()), null, 2);
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error("[whybuddy-store] flushToDisk failed:", (e as Error)?.message || e);
  }
}

// Initial load (runs once when tsx loads this module; watch will re-exec on file change).
loadFromDisk();

// GET /api/whybuddy/sessions
// Returns { sessions: [...] } for easy consumption (also accepts raw array on client).
router.get("/sessions", (_req: Request, res: Response) => {
  const list = Array.from(sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    goal: s.goal?.text || "",
    createdAt: (s as any).createdAt,
    lastActive: (s as any).lastActive,
    artifactCount: (s.artifacts || []).length,
    phase: (s as any).runtimePhase,
  }));
  res.json({ sessions: list });
});

// GET /api/whybuddy/sessions/:sessionId
router.get("/sessions/:sessionId", (req: Request, res: Response) => {
  const sid = req.params.sessionId;
  const s = sessions.get(sid);
  if (!s) {
    return res.status(404).json({ error: "not_found", sessionId: sid });
  }
  res.json(s);
});

// PUT /api/whybuddy/sessions/:sessionId
// Body: the full V5SessionState (or a partial that we treat as the new truth for the session).
// We trust the client for the prototype phase (same as the in-memory client store did).
router.put("/sessions/:sessionId", express.json({ limit: "2mb" }), (req: Request, res: Response) => {
  const sid = req.params.sessionId;
  const body = (req.body || {}) as Partial<V5SessionState> & { sessionId?: string };

  // Force the key from the URL (defense in depth)
  const state: V5SessionState = {
    ...(body as V5SessionState),
    sessionId: sid,
  };

  // Stamp lastActive for list views (client also does this, server does it too for purity)
  (state as any).lastActive = new Date().toISOString();
  if (!(state as any).createdAt) {
    const existing = sessions.get(sid);
    (state as any).createdAt = (existing as any)?.createdAt || (state as any).lastActive;
  }

  sessions.set(sid, state);
  flushToDisk();
  res.status(200).json(state);
});

// DELETE /api/whybuddy/sessions/:sessionId
router.delete("/sessions/:sessionId", (req: Request, res: Response) => {
  const sid = req.params.sessionId;
  const existed = sessions.delete(sid);
  flushToDisk();
  // 204 No Content is conventional for successful DELETE even if it didn't exist
  res.status(204).end();
});

// (Optional nicety) allow a manual clear for dev / tests against the real server
// Not part of the official 4-endpoint contract.
router.post("/sessions/__clear", (_req: Request, res: Response) => {
  sessions.clear();
  flushToDisk();
  res.status(204).end();
});

export default router;

/**
 * Durability pilot test helpers (smoke + future server tests only).
 * - Never called from normal request handlers or the public HTTP surface.
 * - Allow the smoke to prove "re-initialize backing from durable file recovers prior writes"
 *   without killing the dev server process.
 */
export const __WHYBUDDY_SESSIONS_FILE = DATA_FILE;

export function __reloadFromDisk(): void {
  sessions.clear();
  loadFromDisk();
}
