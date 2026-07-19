import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubRepositorySnapshot } from "@/lib/affected-routes/github-source";

const mocks = vi.hoisted(() => ({ githubJson: vi.fn() }));

vi.mock("@/lib/github/api-client", () => ({
  githubApiBaseUrl: "https://api.github.com",
  githubJson: mocks.githubJson,
}));

const headSha = "0123456789abcdef0123456789abcdef01234567";
const routeSha = "1111111111111111111111111111111111111111";
const changedSha = "2222222222222222222222222222222222222222";
const extraSha = "3333333333333333333333333333333333333333";
const largeSha = "4444444444444444444444444444444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.githubJson.mockImplementation(async (url: string) => {
    if (url.includes("/git/trees/")) {
      return {
        truncated: false,
        tree: [
          { path: "src/app/page.tsx", type: "blob", sha: routeSha, size: 50 },
          { path: "src/components/Changed.tsx", type: "blob", sha: changedSha, size: 50 },
          { path: "src/components/Extra.tsx", type: "blob", sha: extraSha, size: 50 },
          { path: "src/components/Large.tsx", type: "blob", sha: largeSha, size: 500_000 },
          { path: "public/image.png", type: "blob", sha: largeSha, size: 50 },
        ],
      };
    }
    const sha = url.split("/").at(-1);
    const content =
      sha === routeSha
        ? "export default function Page() { return null }"
        : "export function Changed() { return null }";
    return {
      encoding: "base64",
      size: Buffer.byteLength(content),
      content: Buffer.from(content).toString("base64"),
    };
  });
});

describe("bounded GitHub source loading", () => {
  it("prioritizes changed and route files while enforcing file count and size", async () => {
    const result = await fetchGitHubRepositorySnapshot({
      owner: "octocat",
      repository: "affected-routes",
      headSha,
      changedFiles: ["src/components/Changed.tsx"],
      limits: {
        maxDepth: 8,
        maxFiles: 2,
        maxFileSizeBytes: 200_000,
        timeoutMs: 8_000,
      },
    });

    expect(result.files.map((file) => file.path)).toEqual([
      "src/components/Changed.tsx",
      "src/app/page.tsx",
    ]);
    expect(result.filesSkipped).toBe(3);
    expect(result.warnings).toContain("Repository source loading reached the 2-file limit.");
    expect(mocks.githubJson).toHaveBeenCalledTimes(3);
  });
});
