import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { appState } = vi.hoisted(() => ({
  appState: {
    locale: "zh-CN",
    loadingProgress: 67,
    setLocale: () => {},
    toggleLocale: () => {},
  },
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) =>
    selector(appState),
}));

import { LoadingScreen } from "../LoadingScreen";

describe("LoadingScreen", () => {
  beforeEach(() => {
    appState.locale = "zh-CN";
    appState.loadingProgress = 67;
  });

  it("renders the study configuration loading composition", () => {
    const markup = renderToStaticMarkup(<LoadingScreen />);

    expect(markup).toContain('data-testid="loading-screen"');
    expect(markup).toContain('data-testid="loading-pixel-field"');
    expect(markup).toContain('data-testid="loading-wide-card"');
    expect(markup).toContain('data-testid="loading-status-rail"');
    expect(markup).toContain('data-testid="loading-simple-logo"');
    expect(markup).toContain("CUBE PETS OFFICE");
    expect(markup).toContain("SYSTEM");
    expect(markup).toContain("ONLINE");
    expect(markup).toContain("INIT");
    expect(markup).toContain("SYNC");
    expect(markup).toContain("CONFIG");
    expect(markup).toContain("FINALIZE");
    expect(markup).toContain("VER. 1.0.0");
    expect(markup).toContain("\u6b63\u5728\u914d\u7f6e\u4e66\u623f");
    expect(markup).toContain(
      "\u5c0f\u5ba0\u7269\u4eec\u6b63\u5728\u642c\u5bb6\u5177\uff0c\u9a6c\u4e0a\u5c31\u7eea"
    );
    expect(markup).toContain("PIXEL SYNC");
    expect(markup).toContain("67%");
    expect(markup).toContain(
      "\u6b63\u5728\u540c\u6b65\u4e66\u623f\u5e03\u5c40\u4e0e\u88c5\u9970\u6570\u636e..."
    );
    expect(markup).toContain("linear-gradient(90deg,#ef3340");
    expect(markup).toContain("CUBE PETS OFFICE");
    expect(markup).toContain("--loading-progress:67%");
  });
});
