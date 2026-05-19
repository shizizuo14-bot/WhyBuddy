import type { NextFunction, Request, Response } from "express";

import { isAdminRole } from "../../shared/auth.js";
import type { AuthenticatedRequest, RequestWithOptionalUser } from "./types.js";
import type { SessionService } from "./session-service.js";

export function createAuthMiddleware(sessionService: SessionService) {
  async function restoreUser(request: Request): Promise<RequestWithOptionalUser | null> {
    const token = sessionService.readSessionToken(request);
    // DB 连接不稳定（ECONNRESET / pool exhausted 等）不应该让进程崩溃；
    // 对 auth 路径而言,无法读 session 的语义 = "当前请求未认证"。
    let result: Awaited<ReturnType<SessionService["resolveCurrentUser"]>>;
    try {
      result = await sessionService.resolveCurrentUser(token);
    } catch (error) {
      console.error("[auth] restoreUser failed; treating as unauthenticated", error);
      return null;
    }
    if (!result) return null;

    const target = request as RequestWithOptionalUser;
    target.user = result.user;
    target.sessionId = result.sessionId;
    return target;
  }

  return {
    async requireAuth(request: Request, response: Response, next: NextFunction) {
      try {
        const restored = await restoreUser(request);
        if (!restored) {
          sessionService.clearCookie(response);
          response.status(401).json({ success: false, error: "Authentication required" });
          return;
        }
        next();
      } catch (error) {
        // 理论上 restoreUser 已经把错误吞进去了,这里是双保险。
        next(error);
      }
    },

    async optionalAuth(request: Request, _response: Response, next: NextFunction) {
      try {
        await restoreUser(request);
      } catch (error) {
        console.error("[auth] optionalAuth swallowed error", error);
      }
      next();
    },

    requireAdmin(request: Request, response: Response, next: NextFunction) {
      const user = (request as AuthenticatedRequest).user;
      if (!user) {
        response.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      if (!isAdminRole(user.role)) {
        response.status(403).json({ success: false, error: "Admin privileges required" });
        return;
      }

      next();
    },
  };
}
