import { describe, expect, it } from "vitest";

import * as copy from "./copy.js";
import * as barrel from "./index.js";

/**
 * wt2 任务 5：blueprint lib 归类 smoke 测试。
 */
describe("client/src/lib/blueprint re-export views", () => {
  it("copy.ts 导出 blueprintCopy helper", () => {
    expect(typeof copy.blueprintCopy).toBe("function");
  });

  it("barrel 也可以直接拿到 blueprintCopy", () => {
    expect(typeof barrel.blueprintCopy).toBe("function");
  });
});
