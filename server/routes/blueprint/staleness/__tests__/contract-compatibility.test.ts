import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONTRACTS_PATH = join(process.cwd(), "shared/blueprint/contracts.ts");

function extractInterfaceBody(source: string, interfaceName: string): string {
  const match = source.match(
    new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) {
    throw new Error(`Missing interface ${interfaceName}`);
  }
  return match[1];
}

function extractTopLevelFieldNames(interfaceBody: string): string[] {
  const names: string[] = [];
  let depth = 0;

  for (const line of interfaceBody.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*") || trimmed.startsWith("/")) {
      continue;
    }

    if (depth === 0) {
      const match = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\?)?:/);
      if (match) {
        names.push(match[1]);
      }
    }

    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
  }

  return names;
}

describe("blueprint contract compatibility", () => {
  it("keeps pre-staleness artifact and job fields as subsets of the expanded contracts", () => {
    const source = readFileSync(CONTRACTS_PATH, "utf8");
    const artifactFields = extractTopLevelFieldNames(
      extractInterfaceBody(source, "BlueprintGenerationArtifact"),
    );
    const jobFields = extractTopLevelFieldNames(
      extractInterfaceBody(source, "BlueprintGenerationJob"),
    );

    expect(artifactFields).toEqual(
      expect.arrayContaining([
        "id",
        "type",
        "title",
        "summary",
        "createdAt",
        "payload",
      ]),
    );
    expect(artifactFields).toEqual(
      expect.arrayContaining(["staleSince", "invalidatedBy"]),
    );
    expect(jobFields).toEqual(
      expect.arrayContaining([
        "id",
        "request",
        "status",
        "stage",
        "version",
        "createdAt",
        "updatedAt",
        "artifacts",
        "events",
      ]),
    );
    expect(jobFields).toContain("staleArtifactIds");
  });
});
