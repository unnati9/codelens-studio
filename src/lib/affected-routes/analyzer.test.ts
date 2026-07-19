import { describe, expect, it } from "vitest";
import {
  nextAppFixture,
  nextPagesFixture,
  reactRouterFixture,
  routeConfig,
  snapshot,
} from "../../../tests/fixtures/affected-routes";
import { analyzeAffectedRoutes } from "@/lib/affected-routes/analyzer";
import { classifyAffectedFile } from "@/lib/affected-routes/classification";

const limits = {
  maxDepth: 8,
  maxFiles: 300,
  maxFileSizeBytes: 200_000,
  timeoutMs: 8_000,
};

describe("affected route analyzer", () => {
  it("traces a changed aliased component to a Next.js App Router route", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/components/Button.tsx"],
      config: null,
      limits,
      now: "2026-07-19T11:00:00.000Z",
    });

    expect(result.framework).toBe("NEXT_APP_ROUTER");
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      routePath: "/dashboard",
      impact: "INDIRECT",
      confidence: "MEDIUM",
      relatedChangedFiles: ["src/components/Button.tsx"],
    });
    expect(result.routes[0].importChain).toEqual([
      "src/components/Button.tsx",
      "src/components/Card.tsx",
      "src/app/dashboard/page.tsx",
    ]);
  });

  it("resolves jsconfig aliases for Next.js Pages Router routes", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextPagesFixture,
      changedFiles: ["src/components/Shared.jsx"],
      config: null,
      limits,
    });

    expect(result.framework).toBe("NEXT_PAGES_ROUTER");
    expect(result.routes.map((route) => route.routePath)).toEqual(["/", "/about"]);
    expect(result.routes.every((route) => route.impact === "DIRECT")).toBe(true);
  });

  it("detects React Router JSX routes and follows their components", () => {
    const result = analyzeAffectedRoutes({
      snapshot: reactRouterFixture,
      changedFiles: ["src/ui/Button.tsx"],
      config: null,
      limits,
    });

    expect(result.framework).toBe("REACT_ROUTER");
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      routePath: "/dashboard",
      framework: "REACT_ROUTER",
      impact: "DIRECT",
    });
  });

  it("adds concrete examples and setup instructions to dynamic routes", () => {
    const config = routeConfig({
      dynamic_route_examples: [
        { routePath: "/products/[id]", examplePath: "/products/example-product" },
      ],
      routes_requiring_setup: [
        { routePath: "/products/[id]", instructions: "Seed the example product." },
      ],
    });
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/components/Product.tsx"],
      config,
      limits,
    });

    expect(result.routes[0]).toMatchObject({
      routePath: "/products/[id]",
      examplePath: "/products/example-product",
      requiresSetup: true,
      setupInstructions: "Seed the example product.",
    });
    expect(result.routes[0].dynamicRouteWarning).toContain("Configured example");
  });

  it("terminates circular import traversal without duplicating routes", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/components/Button.tsx"],
      config: null,
      limits: { ...limits, maxDepth: 20 },
    });

    expect(result.routes.map((route) => route.routePath)).toEqual(["/dashboard"]);
    expect(result.stats.traversalTruncated).toBe(false);
  });

  it("treats global CSS as broad impact across every detected route", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/app/globals.css"],
      config: null,
      limits,
    });

    expect(result.broadImpact).toBe(true);
    expect(result.routes.map((route) => route.routePath)).toEqual([
      "/",
      "/dashboard",
      "/products/[id]",
    ]);
    expect(result.routes.every((route) => route.impact === "BROAD")).toBe(true);
  });

  it("treats a shared header as broad impact", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/components/Header.tsx"],
      config: null,
      limits,
    });

    expect(result.broadImpactFiles).toEqual(["src/components/Header.tsx"]);
    expect(result.routes).toHaveLength(3);
  });

  it("supports manual mappings and irrelevant route overrides", () => {
    const config = routeConfig({
      route_mappings: [{ routePath: "/legacy", sourceFiles: [] }],
      ignored_routes: ["/legacy"],
    });
    const result = analyzeAffectedRoutes({
      snapshot: snapshot([]),
      changedFiles: ["legacy/template.js"],
      config,
      limits,
    });

    expect(result.routes[0]).toMatchObject({
      routePath: "/legacy",
      manuallyConfigured: true,
      irrelevant: true,
      capturePriority: "LOW",
    });
  });

  it("classifies tests, generated files, backend files, hooks, and styles", () => {
    expect(classifyAffectedFile("src/Button.test.tsx").category).toBe("TEST");
    expect(classifyAffectedFile("src/generated/client.ts").category).toBe("GENERATED");
    expect(classifyAffectedFile("src/pages/api/health.ts").category).toBe("BACKEND");
    expect(classifyAffectedFile("src/app/page.tsx").category).toBe("ROUTE");
    expect(classifyAffectedFile("src/hooks/useBoard.ts").category).toBe("HOOK");
    expect(classifyAffectedFile("useBoard.ts").category).toBe("HOOK");
    expect(classifyAffectedFile("src/card.module.css").category).toBe("STYLESHEET");
    expect(classifyAffectedFile("README.md").category).toBe("UNKNOWN");
  });

  it("reports depth truncation when an import chain exceeds the bound", () => {
    const result = analyzeAffectedRoutes({
      snapshot: nextAppFixture,
      changedFiles: ["src/components/Button.tsx"],
      config: null,
      limits: { ...limits, maxDepth: 1 },
    });

    expect(result.routes).toEqual([]);
    expect(result.stats.traversalTruncated).toBe(true);
  });
});
