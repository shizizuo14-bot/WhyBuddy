import type { CSSProperties } from "react";

import { useI18n } from "@/i18n";
import { useAppStore } from "@/lib/store";

const RAIL_STEPS = ["INIT", "SYNC", "CONFIG", "FINALIZE"] as const;

const BACKDROP_BLOCKS = [
  "left-[6%] top-[18%] h-3 w-3 bg-[#ef3340]",
  "left-[14%] top-[58%] h-5 w-5 bg-white/80",
  "left-[22%] top-[30%] h-2 w-2 bg-[#8f9baa]",
  "left-[27%] top-[76%] h-4 w-4 bg-[#d7a36a]",
  "right-[10%] top-[24%] h-3 w-3 bg-[#8f9baa]",
  "right-[19%] top-[44%] h-2.5 w-2.5 bg-[#ef3340]",
  "right-[25%] top-[70%] h-5 w-5 bg-white/70",
  "right-[7%] top-[64%] h-3 w-3 bg-[#d7a36a]",
] as const;

/* Geometric logo removed – using inline SVG instead */

const CHINESE_COPY = {
  title: "\u6b63\u5728\u914d\u7f6e\u4e66\u623f",
  subtitle:
    "\u5c0f\u5ba0\u7269\u4eec\u6b63\u5728\u642c\u5bb6\u5177\uff0c\u9a6c\u4e0a\u5c31\u7eea",
  progress:
    "\u6b63\u5728\u540c\u6b65\u4e66\u623f\u5e03\u5c40\u4e0e\u88c5\u9970\u6570\u636e...",
};

const ENGLISH_COPY = {
  title: "Configuring the study",
  subtitle: "The cube pets are moving furniture. Almost ready",
  progress: "Syncing study layout and decoration data...",
};

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function PixelField() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="loading-pixel-field"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(28,42,62,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(28,42,62,0.075)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0.2)_45%,rgba(211,218,226,0.4)_100%)]" />
      <div className="absolute left-[9%] top-[34%] h-36 w-36 opacity-[0.45]">
        {Array.from({ length: 24 }).map((_, index) => (
          <span
            key={index}
            className="absolute border border-white/80 bg-white/[0.55] shadow-[0_8px_20px_rgba(35,48,66,0.08)]"
            style={{
              left: (index % 6) * 18 + Math.abs(3 - (index % 6)) * 2,
              top: Math.floor(index / 6) * 18 + (index % 2) * 3,
              width: 15,
              height: 15,
            }}
          />
        ))}
      </div>
      <div className="absolute right-[11%] top-[38%] h-40 w-40 opacity-[0.4]">
        {Array.from({ length: 28 }).map((_, index) => (
          <span
            key={index}
            className="absolute border border-white/80 bg-white/[0.5] shadow-[0_8px_20px_rgba(35,48,66,0.08)]"
            style={{
              left: (index % 7) * 18,
              top: Math.floor(index / 7) * 18 + Math.abs(3 - (index % 7)) * 2,
              width: 15,
              height: 15,
            }}
          />
        ))}
      </div>
      {BACKDROP_BLOCKS.map(className => (
        <span
          key={className}
          className={`absolute rounded-[2px] shadow-[0_8px_18px_rgba(35,48,66,0.12)] ${className}`}
        />
      ))}
      <span className="absolute left-[17%] top-[24%] h-7 w-7 rounded-full border-[6px] border-[#d7a36a]/80" />
      <span className="absolute right-[16%] top-[22%] h-7 w-7 rounded-full border-[6px] border-[#ef3340]/80" />
      <span className="absolute bottom-[16%] left-[19%] h-2 w-8 rotate-45 rounded-full bg-[#8f9baa]/70" />
      <span className="absolute bottom-[19%] right-[22%] h-2 w-8 -rotate-45 rounded-full bg-[#ef3340]/55" />
    </div>
  );
}

function LoadingStatusRail() {
  return (
    <aside
      className="relative flex min-h-[360px] flex-col justify-between overflow-hidden rounded-[30px] border border-white/70 bg-[#eef2f6]/[0.78] px-5 py-6 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] lg:min-h-[510px] lg:rounded-l-[38px] lg:rounded-r-[24px]"
      data-testid="loading-status-rail"
    >
      <div>
        <p className="font-data text-[11px] font-black uppercase tracking-[0.32em] text-[#26364a]">
          SYSTEM
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#d9dfe6] bg-white/75 px-3 py-1.5 font-data text-[10px] font-black uppercase tracking-[0.24em] text-[#ef3340]">
          <span className="h-2 w-2 rounded-full bg-[#ef3340] shadow-[0_0_0_4px_rgba(239,51,64,0.12)]" />
          ONLINE
        </div>
      </div>

      <div className="relative my-8 pl-4">
        <span className="absolute left-[21px] top-3 h-[calc(100%-24px)] w-px bg-[#cfd6de]" />
        <div className="flex flex-col gap-7">
          {RAIL_STEPS.map((step, index) => (
            <div key={step} className="relative flex items-center gap-4">
              <span
                className={`relative z-10 h-3.5 w-3.5 rounded-sm border-2 ${
                  index < 3
                    ? "border-[#ef3340] bg-[#ef3340]"
                    : "border-[#9da8b5] bg-white"
                }`}
              />
              <span
                className={`font-data text-[11px] font-black uppercase tracking-[0.26em] ${
                  index < 3 ? "text-[#26364a]" : "text-[#8f9baa]"
                }`}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="font-data text-[10px] font-black uppercase tracking-[0.28em] text-[#7a8695]">
        VER. 1.0.0
      </p>
    </aside>
  );
}

/**
 * Geometric logo — three isometric cubes stacked in an L-shape.
 * Pure SVG, cool blue-grey palette with warm accent.
 */
function SimpleLoadingLogo() {
  return (
    <div
      aria-label="CUBE PETS OFFICE"
      className="relative mx-auto flex h-[170px] w-full max-w-[340px] items-center justify-center sm:h-[200px]"
      data-testid="loading-simple-logo"
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-[130px] w-[130px] drop-shadow-[0_16px_40px_rgba(35,48,66,0.18)] sm:h-[150px] sm:w-[150px]"
      >
        {/* ── bottom-left cube ── */}
        <g>
          <path d="M20 58 L40 46 L60 58 L40 70Z" fill="#dfe5eb" />
          <path d="M20 58 L40 70 L40 94 L20 82Z" fill="#8f9baa" />
          <path d="M60 58 L40 70 L40 94 L60 82Z" fill="#b0bac5" />
        </g>

        {/* ── bottom-right cube ── */}
        <g>
          <path d="M60 58 L80 46 L100 58 L80 70Z" fill="#cbd3dc" />
          <path d="M60 58 L80 70 L80 94 L60 82Z" fill="#8f9baa" />
          <path d="M100 58 L80 70 L80 94 L100 82Z" fill="#a3adb8" />
        </g>

        {/* ── top cube (stacked, warm accent) ── */}
        <g>
          <path d="M40 34 L60 22 L80 34 L60 46Z" fill="#ef3340" />
          <path d="M40 34 L60 46 L60 70 L40 58Z" fill="#c42a34" />
          <path d="M80 34 L60 46 L60 70 L80 58Z" fill="#d93040" />
        </g>
      </svg>
    </div>
  );
}

function CubeMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className="shrink-0"
    >
      <path d="M10 2 L18 10 L10 18 L2 10Z" fill="#8f9baa" />
      <path d="M10 2 L18 10 L10 10Z" fill="#ef3340" />
      <path d="M10 10 L18 10 L10 18Z" fill="#b0bac5" />
    </svg>
  );
}

export function LoadingScreen() {
  const loadingProgress = useAppStore(state => state.loadingProgress);
  const { locale } = useI18n();
  const progress = clampProgress(loadingProgress);
  const copy = locale === "zh-CN" ? CHINESE_COPY : ENGLISH_COPY;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#eef2f5] px-4 py-6 text-center text-[#132238] sm:px-6 lg:py-8"
      data-testid="loading-screen"
    >
      <PixelField />

      <main className="relative z-10 flex w-full max-w-[1120px] flex-col items-center">
        <section
          className="grid w-full gap-4 overflow-hidden rounded-[34px] border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(242,246,249,0.78))] p-4 shadow-[0_30px_90px_rgba(35,48,66,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl lg:grid-cols-[152px_minmax(0,1fr)] lg:gap-5 lg:rounded-[44px] lg:p-5"
          data-testid="loading-wide-card"
        >
          <LoadingStatusRail />

          <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/[0.58] px-5 pb-6 pt-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:px-8 sm:pb-8 lg:min-h-[510px] lg:px-10 lg:pb-9 lg:pt-8">
            <span className="absolute left-6 top-6 h-2 w-2 rounded-sm bg-[#ef3340]" />
            <span className="absolute right-10 top-10 h-3 w-3 rounded-sm bg-[#d7a36a]" />
            <span className="absolute right-[18%] top-[19%] h-2 w-2 rounded-sm bg-[#8f9baa]" />

            <SimpleLoadingLogo />

            <div className="mx-auto mt-1 max-w-[760px]">
              <h1 className="text-[clamp(2.4rem,7vw,5.55rem)] font-black leading-[0.95] tracking-[0.01em] text-[#132238]">
                {copy.title}
              </h1>
              <p className="mt-4 text-[clamp(1rem,2vw,1.5rem)] font-medium leading-8 text-[#7a8695]">
                {copy.subtitle}
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6f7d8b]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ef3340]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#d3dae2]" />
              </div>

              <div
                className="mx-auto mt-7 max-w-[690px] rounded-[24px] border border-[#d9dfe6] bg-white/[0.78] p-4 text-left shadow-[0_18px_44px_rgba(35,48,66,0.1),inset_0_1px_0_rgba(255,255,255,0.88)] sm:p-5"
                style={
                  { "--loading-progress": `${progress}%` } as CSSProperties
                }
              >
                <div className="mb-4 flex items-center justify-between gap-4 font-data text-[12px] font-black uppercase tracking-[0.3em] text-[#4f5d6d] sm:text-sm">
                  <span>PIXEL SYNC</span>
                  <span className="tracking-normal text-[#ef3340]">
                    {progress}%
                  </span>
                </div>
                <div className="relative h-5 overflow-hidden rounded-full bg-[#d9dfe6] shadow-[inset_0_2px_5px_rgba(31,48,70,0.14)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ef3340_0%,#f0522f_55%,#f5a524_100%)] shadow-[0_9px_18px_rgba(239,51,64,0.3),inset_0_1px_0_rgba(255,255,255,0.26)] transition-[width] duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-3 text-center text-sm font-semibold leading-6 text-[#7a8695]">
                  {copy.progress}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-7 flex max-w-full items-center justify-center gap-4 font-data text-[11px] font-black uppercase tracking-[0.44em] text-[#4c5a69] sm:text-sm sm:tracking-[0.58em]">
          <CubeMark />
          <span>CUBE PETS OFFICE</span>
          <CubeMark />
        </footer>
      </main>
    </div>
  );
}
