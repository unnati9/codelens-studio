import type { AffectedFileCategory } from "@/lib/affected-routes/schema";

const sourceExtensionPattern = /\.(?:[cm]?[jt]sx?)$/i;
const stylesheetPattern = /\.(?:css|scss|sass|less)$/i;
const routeFilePattern =
  /(?:^|\/)(?:src\/)?app\/(?:.*\/)?page\.[cm]?[jt]sx?$|(?:^|\/)(?:src\/)?pages\/(?:.*\/)?[^/]+\.[cm]?[jt]sx?$/i;

export function isSupportedAnalysisFile(path: string): boolean {
  return (
    sourceExtensionPattern.test(path) ||
    stylesheetPattern.test(path) ||
    /(?:^|\/)(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json$/i.test(path)
  );
}

export function classifyAffectedFile(path: string): {
  category: AffectedFileCategory;
  reason: string;
} {
  const normalized = path.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const basename = lower.split("/").at(-1) ?? lower;
  const originalBasename = normalized.split("/").at(-1) ?? normalized;

  if (
    /(?:^|\/)(?:__tests__|test|tests|e2e|cypress|playwright)(?:\/|$)/.test(lower) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(lower)
  ) {
    return {
      category: "TEST",
      reason: "Test and automation files do not render a production route.",
    };
  }
  if (
    /(?:^|\/)(?:dist|build|coverage|\.next|generated|vendor)(?:\/|$)/.test(lower) ||
    /(?:\.generated\.|\.min\.(?:js|css)$|(?:^|\/)package-lock\.json$|(?:^|\/)yarn\.lock$|(?:^|\/)pnpm-lock\.yaml$)/.test(
      lower,
    )
  ) {
    return {
      category: "GENERATED",
      reason: "Generated, vendored, or lock files are not traversed.",
    };
  }
  if (
    /(?:^|\/)pages\/api(?:\/|$)/.test(lower) ||
    /(?:^|\/)app\/(?:.*\/)?route\.[cm]?[jt]s$/.test(lower) ||
    /(?:\.server|\.action)\.[cm]?[jt]sx?$/.test(lower) ||
    /(?:^|\/)(?:server|api|backend)(?:\/|$)/.test(lower)
  ) {
    return {
      category: "BACKEND",
      reason: "The file is classified as server or API implementation.",
    };
  }
  if (/^(?:global|globals)\.(?:css|scss|sass|less)$/.test(basename)) {
    return {
      category: "GLOBAL_CSS",
      reason: "Global stylesheet changes can affect every UI route.",
    };
  }
  if (stylesheetPattern.test(lower)) {
    return {
      category: "STYLESHEET",
      reason: "Stylesheet impact is traced through static imports.",
    };
  }
  if (
    /(?:^|\/)(?:src\/)?app(?:\/.*)?\/layout\.[cm]?[jt]sx?$/.test(lower) ||
    /(?:^|\/)(?:src\/)?pages\/_app\.[cm]?[jt]sx?$/.test(lower) ||
    /(?:^|\/)(?:layouts?|providers?)(?:\/|\.)/.test(lower)
  ) {
    return {
      category: "SHARED_LAYOUT",
      reason: "Shared layout or provider code can affect many routes.",
    };
  }
  if (
    routeFilePattern.test(lower) &&
    !/(?:^|\/)pages\/(?:_app|_document|_error|404|500)\./.test(lower)
  ) {
    return {
      category: "ROUTE",
      reason: "The file follows a supported framework route convention.",
    };
  }
  if (
    /(?:^|\/)(?:hooks?)(?:\/|$)/.test(lower) ||
    /^use[A-Z0-9]/.test(originalBasename.replace(/\.[^.]+$/, ""))
  ) {
    return { category: "HOOK", reason: "Hook impact is traced through static imports." };
  }
  if (/(?:^|\/)(?:components?|ui)(?:\/|$)/.test(lower) || /\.(?:tsx|jsx)$/.test(lower)) {
    return {
      category: "UI_COMPONENT",
      reason: "UI component impact is traced toward route components.",
    };
  }
  return {
    category: "UNKNOWN",
    reason: "No supported UI, route, style, test, or backend pattern matched.",
  };
}

export function isBroadImpactFile(path: string, category: AffectedFileCategory): boolean {
  if (category === "GLOBAL_CSS") return true;
  const lower = path.toLowerCase();
  if (/(?:^|\/)(?:src\/)?app\/layout\.[cm]?[jt]sx?$/.test(lower)) return true;
  if (/(?:^|\/)(?:src\/)?pages\/_app\.[cm]?[jt]sx?$/.test(lower)) return true;
  const stem = (lower.split("/").at(-1) ?? lower).replace(/\.[^.]+$/, "");
  return (
    stem.includes("theme") || /providers?$/.test(stem) || stem === "header" || stem === "footer"
  );
}
