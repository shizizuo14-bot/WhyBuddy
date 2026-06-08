import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("check_previews_real.py integrity", () => {
  it("matches the committed SHA-256 manifest", () => {
    const scriptPath = join(
      process.cwd(),
      "skills/whybuddy/whybuddy/scripts/check_previews_real.py",
    );
    const manifestPath = join(
      process.cwd(),
      "skills/whybuddy/whybuddy/scripts/check_previews_real.sha256",
    );
    const script = readFileSync(scriptPath);
    const manifest = readFileSync(manifestPath, "utf8").trim();
    const expectedHash = manifest.split(/\s+/)[0];
    const actualHash = createHash("sha256").update(script).digest("hex");

    expect(actualHash).toBe(expectedHash);
  });
});
