import { describe, expect, it } from "vitest";
import { buildDependencyGraph, parseStaticImports } from "@/lib/affected-routes/imports";

describe("static import parsing", () => {
  it("parses import, export-from, side-effect import, and require without dynamic imports", () => {
    const imports = parseStaticImports(`
      import DefaultThing, { Item as LocalItem } from "./thing";
      export { helper } from "./helper";
      import "./theme.css";
      const legacy = require("./legacy");
      const lazy = import("./lazy");
    `);

    expect(imports.map((entry) => entry.specifier)).toEqual([
      "./thing",
      "./helper",
      "./theme.css",
      "./legacy",
    ]);
    expect(imports[0].bindings).toEqual(["DefaultThing", "LocalItem"]);
  });

  it("resolves relative index files and TypeScript aliases with JSON comments", () => {
    const graph = buildDependencyGraph([
      {
        path: "tsconfig.json",
        content: `{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*",],},},}`,
        sizeBytes: 80,
      },
      {
        path: "src/app/page.tsx",
        content: 'import { Button } from "@/ui"; import "../styles.css";',
        sizeBytes: 70,
      },
      { path: "src/ui/index.tsx", content: "export const Button = () => null", sizeBytes: 34 },
      { path: "src/styles.css", content: "body {}", sizeBytes: 7 },
    ]);

    expect(graph.imports.get("src/app/page.tsx")).toEqual(["src/ui/index.tsx", "src/styles.css"]);
  });
});
