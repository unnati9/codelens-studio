import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeVercelDeploymentStatus,
  VercelPreviewProvider,
} from "@/lib/preview-deployments/vercel";

const input = {
  projectId: "prj_1234567890",
  teamId: "team_1234567890",
  productionUrl: "https://example.com",
  headCommitSha: "0123456789abcdef0123456789abcdef01234567",
  headBranch: "feature/preview",
};

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    uid: "dpl_preview_1",
    projectId: input.projectId,
    url: "code-lens-feature-abc.vercel.app",
    readyState: "READY",
    target: null,
    createdAt: 1_721_000_000_000,
    meta: {
      githubCommitSha: input.headCommitSha,
      githubCommitRef: input.headBranch,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VercelPreviewProvider", () => {
  it("prefers a preview deployment matched by the pull-request head SHA", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        pagination: { count: 1 },
        deployments: [deployment()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new VercelPreviewProvider("server-only-token").discover(input);

    expect(result).toMatchObject({
      provider: "VERCEL",
      baseDeploymentUrl: "https://example.com/",
      previewUrl: "https://code-lens-feature-abc.vercel.app/",
      deploymentId: "dpl_preview_1",
      status: "READY",
      commitSha: input.headCommitSha,
      branch: input.headBranch,
      matchType: "SHA",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe("https://api.vercel.com");
    expect(requestUrl.searchParams.get("sha")).toBe(input.headCommitSha);
    expect(requestUrl.searchParams.has("branch")).toBe(false);
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("manual");
    expect(JSON.stringify(result)).not.toContain("server-only-token");
  });

  it("uses branch matching only after no SHA deployment is found", async () => {
    const branchSha = "abcdef0123456789abcdef0123456789abcdef01";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ pagination: { count: 0 }, deployments: [] }))
      .mockResolvedValueOnce(
        Response.json({
          pagination: { count: 1 },
          deployments: [
            deployment({
              readyState: "BUILDING",
              meta: { githubCommitSha: branchSha, githubCommitRef: input.headBranch },
            }),
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new VercelPreviewProvider("token").discover(input);

    expect(result).toMatchObject({
      status: "BUILDING",
      matchType: "BRANCH",
      commitSha: branchSha,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(fallbackUrl.searchParams.get("branch")).toBe(input.headBranch);
    expect(fallbackUrl.searchParams.has("sha")).toBe(false);
  });

  it("rejects an explicitly mismatched SHA before using the branch fallback", async () => {
    const mismatchedSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          deployments: [
            deployment({
              meta: { githubCommitSha: mismatchedSha, githubCommitRef: input.headBranch },
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          deployments: [deployment({ readyState: "BUILDING" })],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new VercelPreviewProvider("token").discover(input);

    expect(result).toMatchObject({ status: "BUILDING", matchType: "BRANCH" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns not found when neither SHA nor branch has a deployment", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ pagination: { count: 0 }, deployments: [] }))
        .mockResolvedValueOnce(Response.json({ pagination: { count: 0 }, deployments: [] })),
    );

    const result = await new VercelPreviewProvider("token").discover(input);

    expect(result).toMatchObject({
      status: "NOT_FOUND",
      previewUrl: null,
      deploymentId: null,
      commitSha: input.headCommitSha,
      branch: input.headBranch,
      matchType: null,
    });
  });

  it("supports queued-to-ready polling without changing the SHA match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          pagination: { count: 1 },
          deployments: [deployment({ readyState: "QUEUED", url: null })],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ pagination: { count: 1 }, deployments: [deployment()] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new VercelPreviewProvider("token");

    const queued = await provider.discover(input);
    const ready = await provider.discover(input);

    expect(queued.status).toBe("QUEUED");
    expect(ready.status).toBe("READY");
    expect(queued.commitSha).toBe(ready.commitSha);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns access required without exposing a missing or rejected token", async () => {
    const missing = await new VercelPreviewProvider("").discover(input);
    expect(missing).toMatchObject({ status: "ACCESS_REQUIRED", previewUrl: null });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { message: "forbidden" } }, { status: 403 })),
    );
    const forbidden = await new VercelPreviewProvider("private-token").discover(input);
    expect(forbidden).toMatchObject({ status: "ACCESS_REQUIRED", previewUrl: null });
    expect(JSON.stringify(forbidden)).not.toContain("private-token");
  });

  it("rejects provider redirects instead of following them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.example/steal-token" },
        }),
      ),
    );

    const result = await new VercelPreviewProvider("private-token").discover(input);

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toContain("redirected");
  });

  it("tests access to the configured project through Vercel's fixed API origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: input.projectId, name: "codelens-studio" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new VercelPreviewProvider("token").testConnection(input);

    expect(result).toEqual({
      ok: true,
      provider: "VERCEL",
      projectId: input.projectId,
      projectName: "codelens-studio",
    });
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(
      `/v9/projects/${input.projectId}`,
    );
  });
});

describe("normalizeVercelDeploymentStatus", () => {
  it.each([
    ["INITIALIZING", "QUEUED"],
    ["QUEUED", "QUEUED"],
    ["BUILDING", "BUILDING"],
    ["READY", "READY"],
    ["ERROR", "FAILED"],
    ["CANCELED", "CANCELLED"],
    ["BLOCKED", "ACCESS_REQUIRED"],
  ] as const)("maps %s to %s", (vercelStatus, expected) => {
    expect(normalizeVercelDeploymentStatus(vercelStatus)).toBe(expected);
  });
});
