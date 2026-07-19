import type {
  RepositoryRouteConfig,
  RepositorySourceFile,
  RepositorySourceSnapshot,
} from "@/lib/affected-routes/schema";

const headSha = "0123456789abcdef0123456789abcdef01234567";

function source(path: string, content: string): RepositorySourceFile {
  return { path, content, sizeBytes: new TextEncoder().encode(content).byteLength };
}

export function snapshot(
  files: RepositorySourceFile[],
  repository = "octocat/affected-routes",
): RepositorySourceSnapshot {
  return {
    repository,
    headSha,
    files,
    repositoryFilesSeen: files.length,
    filesSkipped: 0,
    treeTruncated: false,
    timedOut: false,
    warnings: [],
  };
}

export const nextAppFixture = snapshot([
  source(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
  ),
  source(
    "src/app/layout.tsx",
    'import "./globals.css"; import { Providers } from "@/components/Providers"; export default function Layout({ children }) { return <Providers>{children}</Providers> }',
  ),
  source("src/app/globals.css", "body { color: #123; }"),
  source(
    "src/app/page.tsx",
    'import { Header } from "@/components/Header"; export default function Page() { return <Header /> }',
  ),
  source(
    "src/app/dashboard/page.tsx",
    'import { Card } from "@/components/Card"; export default function Dashboard() { return <Card /> }',
  ),
  source(
    "src/app/products/[id]/page.tsx",
    'import { Product } from "@/components/Product"; export default function ProductPage() { return <Product /> }',
  ),
  source(
    "src/components/Card.tsx",
    'import { Button } from "./Button"; export function Card() { return <Button /> }',
  ),
  source(
    "src/components/Button.tsx",
    'import { Card } from "./Card"; export function Button() { return <button>Review</button> }',
  ),
  source(
    "src/components/Header.tsx",
    "export function Header() { return <header>CodeLens</header> }",
  ),
  source("src/components/Product.tsx", "export function Product() { return <main>Product</main> }"),
  source(
    "src/components/Providers.tsx",
    "export function Providers({ children }) { return children }",
  ),
  source("src/server/database.ts", "export function query() {}"),
  source("src/components/Card.test.tsx", "test('card', () => {})"),
  source("src/generated/client.ts", "export const generated = true"),
]);

export const nextPagesFixture = snapshot([
  source(
    "jsconfig.json",
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } } }),
  ),
  source(
    "src/pages/_app.jsx",
    'import "~/styles/globals.css"; export default function App({ Component, pageProps }) { return <Component {...pageProps} /> }',
  ),
  source(
    "src/pages/index.jsx",
    'import { Shared } from "~/components/Shared"; export default function Home() { return <Shared /> }',
  ),
  source(
    "src/pages/about.jsx",
    'import { Shared } from "~/components/Shared"; export default function About() { return <Shared /> }',
  ),
  source("src/styles/globals.css", "html { background: white; }"),
  source("src/components/Shared.jsx", "export function Shared() { return <nav>Shared</nav> }"),
  source(
    "src/pages/api/health.js",
    "export default function health(req, res) { res.json({ ok: true }) }",
  ),
]);

export const reactRouterFixture = snapshot([
  source("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } })),
  source(
    "src/router.tsx",
    'import { Routes, Route } from "react-router-dom"; import Dashboard from "@/pages/Dashboard"; export function Router() { return <Routes><Route path="/dashboard" element={<Dashboard />} /></Routes> }',
  ),
  source(
    "src/pages/Dashboard.tsx",
    'import { Button } from "@/ui/Button"; export default function Dashboard() { return <Button /> }',
  ),
  source("src/ui/Button.tsx", "export function Button() { return <button>Review</button> }"),
]);

export function routeConfig(overrides: Partial<RepositoryRouteConfig> = {}): RepositoryRouteConfig {
  return {
    id: "9a88e6c4-1dd3-4970-9e21-3470927f0899",
    github_owner: "octocat",
    github_repository: "affected-routes",
    route_mappings: [],
    dynamic_route_examples: [],
    routes_requiring_setup: [],
    ignored_routes: [],
    created_by: "guest-1",
    created_at: "2026-07-19T10:00:00.000Z",
    updated_at: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}
