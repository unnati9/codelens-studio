import { posix } from "node:path";
import type { RepositorySourceFile } from "@/lib/affected-routes/schema";

const resolutionExtensions = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
];

export type StaticImport = {
  specifier: string;
  bindings: string[];
};

type CompilerAliases = {
  baseDirectory: string;
  paths: Array<{ pattern: string; targets: string[] }>;
};

function normalizePath(path: string) {
  const normalized = posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
  return normalized.startsWith("../") ? "" : normalized;
}

function importBindings(clause: string): string[] {
  const bindings = new Set<string>();
  const trimmed = clause.trim();
  const defaultBinding = trimmed.match(/^([A-Za-z_$][\w$]*)/u)?.[1];
  if (defaultBinding) bindings.add(defaultBinding);
  const namespaceBinding = trimmed.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/u)?.[1];
  if (namespaceBinding) bindings.add(namespaceBinding);
  const named = trimmed.match(/\{([\s\S]*?)\}/u)?.[1];
  if (named) {
    for (const entry of named.split(",")) {
      const local = entry
        .trim()
        .split(/\s+as\s+/u)
        .at(-1)
        ?.trim();
      if (local && /^[A-Za-z_$][\w$]*$/u.test(local)) bindings.add(local);
    }
  }
  return [...bindings];
}

export function parseStaticImports(content: string): StaticImport[] {
  const imports = new Map<string, Set<string>>();
  const add = (specifier: string, bindings: string[] = []) => {
    const existing = imports.get(specifier) ?? new Set<string>();
    bindings.forEach((binding) => existing.add(binding));
    imports.set(specifier, existing);
  };

  const fromPattern = /(?:import|export)\s+([\s\S]{0,1000}?)\s+from\s*["']([^"']+)["']/gu;
  for (const match of content.matchAll(fromPattern)) {
    add(match[2], importBindings(match[1]));
  }
  const sideEffectPattern = /import\s*["']([^"']+)["']/gu;
  for (const match of content.matchAll(sideEffectPattern)) add(match[1]);
  const requirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of content.matchAll(requirePattern)) add(match[1]);

  return [...imports].map(([specifier, bindings]) => ({ specifier, bindings: [...bindings] }));
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }
    output += current;
  }
  return output;
}

function readCompilerAliases(files: RepositorySourceFile[]): CompilerAliases {
  const config = [...files]
    .filter((file) => /(?:^|\/)(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json$/i.test(file.path))
    .sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0];
  if (!config) return { baseDirectory: "", paths: [] };
  try {
    const parsed = JSON.parse(stripJsonComments(config.content).replace(/,\s*([}\]])/gu, "$1")) as {
      compilerOptions?: { baseUrl?: unknown; paths?: unknown };
    };
    const configDirectory = posix.dirname(config.path) === "." ? "" : posix.dirname(config.path);
    const baseUrl =
      typeof parsed.compilerOptions?.baseUrl === "string" ? parsed.compilerOptions.baseUrl : "";
    const rawPaths = parsed.compilerOptions?.paths;
    const paths =
      rawPaths && typeof rawPaths === "object" && !Array.isArray(rawPaths)
        ? Object.entries(rawPaths).flatMap(([pattern, targets]) =>
            Array.isArray(targets) && targets.every((target) => typeof target === "string")
              ? [{ pattern, targets: targets as string[] }]
              : [],
          )
        : [];
    return {
      baseDirectory: normalizePath(posix.join(configDirectory, baseUrl)),
      paths,
    };
  } catch {
    return { baseDirectory: "", paths: [] };
  }
}

function possibleFiles(basePath: string): string[] {
  const normalized = normalizePath(basePath);
  if (!normalized) return [];
  const extension = posix.extname(normalized).toLowerCase();
  const candidates = resolutionExtensions.map((suffix) => `${normalized}${suffix}`);
  for (const suffix of resolutionExtensions.slice(1))
    candidates.push(`${normalized}/index${suffix}`);
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const withoutExtension = normalized.slice(0, -extension.length);
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`, `${withoutExtension}.mts`);
  }
  return [...new Set(candidates)];
}

function aliasBases(specifier: string, aliases: CompilerAliases): string[] {
  const bases: string[] = [];
  for (const mapping of aliases.paths) {
    const starIndex = mapping.pattern.indexOf("*");
    if (starIndex === -1) {
      if (mapping.pattern === specifier) {
        mapping.targets.forEach((target) => bases.push(posix.join(aliases.baseDirectory, target)));
      }
      continue;
    }
    const prefix = mapping.pattern.slice(0, starIndex);
    const suffix = mapping.pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    mapping.targets.forEach((target) =>
      bases.push(posix.join(aliases.baseDirectory, target.replace("*", captured))),
    );
  }
  return bases;
}

export function buildDependencyGraph(
  files: RepositorySourceFile[],
  deadline = Number.POSITIVE_INFINITY,
) {
  const filePaths = new Set(files.map((file) => file.path));
  const aliases = readCompilerAliases(files);
  const imports = new Map<string, string[]>();
  const bindings = new Map<string, Map<string, string>>();
  const processedFiles: RepositorySourceFile[] = [];
  let importsResolved = 0;
  let timedOut = false;

  for (const file of files) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const resolved = new Set<string>();
    const fileBindings = new Map<string, string>();
    for (const parsedImport of parseStaticImports(file.content)) {
      const bases = parsedImport.specifier.startsWith(".")
        ? [posix.join(posix.dirname(file.path), parsedImport.specifier)]
        : [
            ...aliasBases(parsedImport.specifier, aliases),
            ...(aliases.baseDirectory
              ? [posix.join(aliases.baseDirectory, parsedImport.specifier)]
              : []),
          ];
      const target = bases.flatMap(possibleFiles).find((candidate) => filePaths.has(candidate));
      if (!target) continue;
      resolved.add(target);
      parsedImport.bindings.forEach((binding) => fileBindings.set(binding, target));
      importsResolved += 1;
    }
    imports.set(file.path, [...resolved]);
    bindings.set(file.path, fileBindings);
    processedFiles.push(file);
  }

  const reverseImports = new Map<string, Set<string>>();
  for (const [importer, importedFiles] of imports) {
    for (const imported of importedFiles) {
      const importers = reverseImports.get(imported) ?? new Set<string>();
      importers.add(importer);
      reverseImports.set(imported, importers);
    }
  }
  return { imports, reverseImports, bindings, importsResolved, processedFiles, timedOut };
}
