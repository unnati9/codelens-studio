import type {
  AffectedRouteFramework,
  RepositoryRouteConfig,
  RepositorySourceFile,
} from "@/lib/affected-routes/schema";

export type DetectedRoute = {
  routePath: string;
  framework: AffectedRouteFramework;
  sourceFiles: string[];
  manuallyConfigured: boolean;
};

const sourceExtensionPattern = /\.[cm]?[jt]sx?$/i;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function appRoute(filePath: string, allPaths: Set<string>): DetectedRoute | null {
  const segments = filePath.split("/");
  const appIndex = segments.findIndex((segment, index) => segment === "app" && index <= 1);
  if (appIndex === -1 || !/^page\.[cm]?[jt]sx?$/i.test(segments.at(-1) ?? "")) return null;
  const routeSegments = segments.slice(appIndex + 1, -1);
  if (routeSegments.some((segment) => segment.startsWith("_"))) return null;
  const publicSegments = routeSegments.flatMap((segment) => {
    if ((segment.startsWith("(") && segment.endsWith(")")) || segment.startsWith("@")) return [];
    return [segment.replace(/^\(\.{1,3}\)/u, "")].filter(Boolean);
  });
  const sourceFiles = [filePath];
  for (let depth = 0; depth <= routeSegments.length; depth += 1) {
    const directory = segments.slice(0, appIndex + 1 + depth).join("/");
    for (const extension of ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"]) {
      const layout = `${directory}/layout.${extension}`;
      if (allPaths.has(layout)) sourceFiles.push(layout);
    }
  }
  return {
    routePath: publicSegments.length ? `/${publicSegments.join("/")}` : "/",
    framework: "NEXT_APP_ROUTER",
    sourceFiles: unique(sourceFiles),
    manuallyConfigured: false,
  };
}

function pagesRoute(filePath: string): DetectedRoute | null {
  const segments = filePath.split("/");
  const pagesIndex = segments.findIndex((segment, index) => segment === "pages" && index <= 1);
  if (pagesIndex === -1 || !sourceExtensionPattern.test(filePath)) return null;
  const routeSegments = segments.slice(pagesIndex + 1);
  if (!routeSegments.length || routeSegments[0] === "api") return null;
  const filename = routeSegments.at(-1)?.replace(sourceExtensionPattern, "") ?? "";
  if (["_app", "_document", "_error", "404", "500"].includes(filename)) return null;
  routeSegments[routeSegments.length - 1] = filename;
  if (filename === "index") routeSegments.pop();
  return {
    routePath: routeSegments.length ? `/${routeSegments.join("/")}` : "/",
    framework: "NEXT_PAGES_ROUTER",
    sourceFiles: [filePath],
    manuallyConfigured: false,
  };
}

function reactRouterRoutes(
  file: RepositorySourceFile,
  bindings: Map<string, string>,
): DetectedRoute[] {
  if (
    !/from\s*["']react-router(?:-dom)?["']|require\s*\(\s*["']react-router(?:-dom)?["']/u.test(
      file.content,
    )
  ) {
    return [];
  }
  const routes: DetectedRoute[] = [];
  const add = (routePath: string, componentName?: string) => {
    const normalizedPath = routePath.startsWith("/") ? routePath : `/${routePath}`;
    const componentFile = componentName ? bindings.get(componentName) : undefined;
    routes.push({
      routePath: normalizedPath.replace(/\/+/gu, "/"),
      framework: "REACT_ROUTER",
      sourceFiles: unique([file.path, ...(componentFile ? [componentFile] : [])]),
      manuallyConfigured: false,
    });
  };
  const jsxPattern = /<Route\b[^>]*?\bpath\s*=\s*["']([^"']+)["'][^>]*?>/gu;
  for (const match of file.content.matchAll(jsxPattern)) {
    const component = match[0].match(/\b(?:element|Component)\s*=\s*\{?\s*<?([A-Z][\w$]*)/u)?.[1];
    add(match[1], component);
  }
  const objectPattern =
    /\bpath\s*:\s*["']([^"']+)["'][\s\S]{0,500}?\b(?:element|Component)\s*:\s*<?([A-Z][\w$]*)/gu;
  for (const match of file.content.matchAll(objectPattern)) add(match[1], match[2]);
  return routes;
}

export function detectRoutes(
  files: RepositorySourceFile[],
  bindings: Map<string, Map<string, string>>,
  config: RepositoryRouteConfig | null,
): { framework: AffectedRouteFramework; routes: DetectedRoute[] } {
  const allPaths = new Set(files.map((file) => file.path));
  const appRoutes = files.flatMap((file) => {
    const route = appRoute(file.path, allPaths);
    return route ? [route] : [];
  });
  const pagesRoutes = files.flatMap((file) => {
    const route = pagesRoute(file.path);
    return route ? [route] : [];
  });
  const reactRoutes = files.flatMap((file) =>
    reactRouterRoutes(file, bindings.get(file.path) ?? new Map()),
  );
  const detected = [
    ...appRoutes,
    ...(reactRoutes.length > 0 && appRoutes.length === 0 ? [] : pagesRoutes),
    ...reactRoutes,
  ];
  const framework: AffectedRouteFramework = detected.some(
    (route) => route.framework === "NEXT_APP_ROUTER",
  )
    ? "NEXT_APP_ROUTER"
    : detected.some((route) => route.framework === "NEXT_PAGES_ROUTER")
      ? "NEXT_PAGES_ROUTER"
      : detected.some((route) => route.framework === "REACT_ROUTER")
        ? "REACT_ROUTER"
        : "UNKNOWN";
  for (const mapping of config?.route_mappings ?? []) {
    detected.push({
      routePath: mapping.routePath,
      framework,
      sourceFiles: mapping.sourceFiles,
      manuallyConfigured: true,
    });
  }
  const merged = new Map<string, DetectedRoute>();
  for (const route of detected) {
    const key = `${route.framework}:${route.routePath}`;
    const existing = merged.get(key);
    merged.set(key, {
      ...route,
      sourceFiles: unique([...(existing?.sourceFiles ?? []), ...route.sourceFiles]),
      manuallyConfigured: Boolean(existing?.manuallyConfigured || route.manuallyConfigured),
    });
  }
  return {
    framework,
    routes: [...merged.values()].sort((left, right) =>
      left.routePath.localeCompare(right.routePath),
    ),
  };
}

export function dynamicRouteWarning(routePath: string): string | null {
  if (
    !routePath
      .split("/")
      .some((segment) => segment.includes("[") || segment.startsWith(":") || segment.includes("*"))
  ) {
    return null;
  }
  return "Dynamic route: configure a concrete example URL before automated capture.";
}
