import { Buffer } from "node:buffer";
import {
  chromium,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type Request as PlaywrightRequest,
} from "playwright";
import { CaptureJobError } from "@/lib/capture/service";
import { assertSafeCaptureUrl } from "@/lib/capture/safe-url";
import type {
  CaptureAuthConfig,
  CaptureJob,
  CaptureOptions,
  CaptureViewport,
  LoginSetupStep,
} from "@/lib/capture/schema";

const MAX_REQUESTS = 250;
const MAX_REDIRECTS = 5;
const MAX_NETWORK_BYTES = 25 * 1024 * 1024;
const MAX_PAGE_DIMENSION = 20_000;
const MAX_PAGE_PIXELS = 40_000_000;
export const MAX_CAPTURE_ARTIFACT_BYTES = 8 * 1024 * 1024;

export type RawCaptureTargetResult = {
  fullPage: Buffer;
  viewportImage: Buffer;
  finalUrl: string;
  httpStatus: number | null;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{
    url: string;
    method: string;
    resourceType: string;
    errorText: string;
  }>;
  viewport: CaptureViewport;
  pageWidth: number;
  pageHeight: number;
  captureDurationMs: number;
};

export type RawCapturePair = {
  base: RawCaptureTargetResult;
  pr: RawCaptureTargetResult;
  durationMs: number;
};

function configuredBoolean(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function sanitizeUrl(input: string) {
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization|session/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return input.slice(0, 2000);
  }
}

function redactDiagnostic(input: string, secrets: string[]) {
  let output = input;
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  output = output.replace(
    /([?&](?:token|key|secret|password|authorization|session)=)[^&#\s]+/gi,
    "$1[REDACTED]",
  );
  return output.slice(0, 4000);
}

function storageStateFromEnvironment(config: CaptureAuthConfig, secrets: string[]) {
  if (!config.storageStateEnvVar) return undefined;
  const environmentName = config.storageStateEnvVar;
  const configured = process.env[environmentName];
  if (!configured) {
    throw new CaptureJobError(
      "STORAGE_STATE_NOT_CONFIGURED",
      `The worker environment variable ${environmentName} is not configured.`,
      500,
    );
  }
  if (Buffer.byteLength(configured, "utf8") > 1024 * 1024) {
    throw new CaptureJobError("STORAGE_STATE_TOO_LARGE", "Playwright storage state is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(configured, "base64").toString("utf8"));
    } catch {
      throw new CaptureJobError(
        "INVALID_STORAGE_STATE",
        `The worker environment variable ${environmentName} is not valid storage-state JSON.`,
        500,
      );
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CaptureJobError(
      "INVALID_STORAGE_STATE",
      "Playwright storage state must be an object.",
    );
  }
  const state = parsed as { cookies?: unknown; origins?: unknown };
  if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
    throw new CaptureJobError(
      "INVALID_STORAGE_STATE",
      "Playwright storage state must contain cookies and origins arrays.",
    );
  }
  for (const cookie of state.cookies) {
    if (cookie && typeof cookie === "object" && "value" in cookie) {
      const value = (cookie as { value?: unknown }).value;
      if (typeof value === "string" && value) secrets.push(value);
    }
  }
  for (const origin of state.origins) {
    if (!origin || typeof origin !== "object" || !("localStorage" in origin)) continue;
    const entries = (origin as { localStorage?: unknown }).localStorage;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry && typeof entry === "object" && "value" in entry) {
        const value = (entry as { value?: unknown }).value;
        if (typeof value === "string" && value) secrets.push(value);
      }
    }
  }
  return parsed as Exclude<BrowserContextOptions["storageState"], string | undefined>;
}

function contextOptions(job: CaptureJob, secrets: string[]): BrowserContextOptions {
  return {
    viewport: { width: job.viewport.width, height: job.viewport.height },
    deviceScaleFactor: job.viewport.deviceScaleFactor,
    isMobile: job.viewport.isMobile,
    hasTouch: job.viewport.hasTouch,
    locale: job.capture_options.locale,
    timezoneId: job.capture_options.timezoneId,
    colorScheme: job.capture_options.colorScheme,
    reducedMotion: job.capture_options.reducedMotion,
    serviceWorkers: "block",
    acceptDownloads: false,
    storageState: storageStateFromEnvironment(job.auth_config, secrets),
  };
}

async function runLoginSetup(
  page: Page,
  deploymentUrl: URL,
  steps: LoginSetupStep[],
  timeoutMs: number,
  secrets: string[],
) {
  for (const step of steps) {
    switch (step.action) {
      case "goto": {
        const target = new URL(step.path, deploymentUrl.origin);
        await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
        break;
      }
      case "fill": {
        const value = process.env[step.valueEnv];
        if (value === undefined) {
          throw new CaptureJobError(
            "LOGIN_CREDENTIAL_NOT_CONFIGURED",
            `The worker environment variable ${step.valueEnv} is not configured.`,
            500,
          );
        }
        secrets.push(value);
        await page.locator(step.selector).fill(value, { timeout: timeoutMs });
        break;
      }
      case "click":
        await page.locator(step.selector).click({ timeout: timeoutMs });
        break;
      case "waitFor":
        await page.locator(step.selector).waitFor({ state: step.state, timeout: timeoutMs });
        break;
    }
  }
}

function redirectCount(request: PlaywrightRequest) {
  let count = 0;
  let current = request.redirectedFrom();
  while (current) {
    count += 1;
    current = current.redirectedFrom();
  }
  return count;
}

async function applyHiddenSelectors(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    await page.locator(selector).evaluateAll((elements) => {
      for (const element of elements) {
        if (element instanceof HTMLElement) {
          element.dataset.codelensOriginalVisibility = element.style.visibility;
          element.style.setProperty("visibility", "hidden", "important");
        }
      }
    });
  }
}

async function stabilizePage(page: Page, options: CaptureOptions) {
  await page
    .waitForLoadState("networkidle", { timeout: Math.min(options.timeoutMs, 10_000) })
    .catch(() => undefined);
  if (options.readySelector) {
    await page
      .locator(options.readySelector)
      .waitFor({ state: "visible", timeout: options.timeoutMs });
  }
  if (options.waitForFonts) {
    await page.waitForFunction(() => document.fonts?.status === "loaded", undefined, {
      timeout: options.timeoutMs,
    });
  }
  if (options.delayAfterReadyMs > 0) {
    await page.waitForTimeout(options.delayAfterReadyMs);
  }
}

async function captureTarget(
  browser: Browser,
  job: CaptureJob,
  deploymentBaseUrl: string,
): Promise<RawCaptureTargetResult> {
  const startedAt = Date.now();
  const secrets: string[] = [];
  const context = await browser.newContext(contextOptions(job, secrets));
  let page: Page | null = null;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: RawCaptureTargetResult["failedRequests"] = [];
  let safetyError: Error | null = null;
  let requestCount = 0;
  let networkBytes = 0;

  try {
    page = await context.newPage();
    page.setDefaultTimeout(job.capture_options.timeoutMs);
    page.setDefaultNavigationTimeout(job.capture_options.timeoutMs);
    const allowLocalhost =
      process.env.NODE_ENV !== "production" && configuredBoolean("CAPTURE_ALLOW_LOCALHOST");
    const assertUrl = (url: string) => assertSafeCaptureUrl(url, { allowLocalhost });

    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (/^(data:|blob:|about:)/i.test(requestUrl)) {
        await route.continue();
        return;
      }
      requestCount += 1;
      if (requestCount > MAX_REQUESTS) {
        safetyError = new CaptureJobError(
          "BROWSER_RESOURCE_LIMIT",
          `The page exceeded the ${MAX_REQUESTS}-request resource limit.`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      if (redirectCount(request) > MAX_REDIRECTS) {
        safetyError = new CaptureJobError(
          "REDIRECT_LIMIT",
          `The page exceeded the ${MAX_REDIRECTS}-redirect limit.`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      try {
        await assertUrl(requestUrl);
        await route.continue();
      } catch (error) {
        safetyError = error instanceof Error ? error : new Error("Unsafe page request.");
        await route.abort("blockedbyclient");
      }
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.loadingFinished", (event: { encodedDataLength: number }) => {
      networkBytes += Math.max(0, event.encodedDataLength);
      if (networkBytes > MAX_NETWORK_BYTES && !safetyError) {
        safetyError = new CaptureJobError(
          "BROWSER_RESOURCE_LIMIT",
          `The page exceeded the ${Math.floor(MAX_NETWORK_BYTES / 1024 / 1024)} MB network limit.`,
        );
      }
    });

    page.on("console", (message) => {
      if (message.type() === "error" && consoleErrors.length < 100) {
        consoleErrors.push(redactDiagnostic(message.text(), secrets));
      }
    });
    page.on("pageerror", (error) => {
      if (pageErrors.length < 100) pageErrors.push(redactDiagnostic(error.message, secrets));
    });
    page.on("requestfailed", (request) => {
      if (failedRequests.length >= 100) return;
      failedRequests.push({
        url: sanitizeUrl(request.url()),
        method: request.method().slice(0, 20),
        resourceType: request.resourceType().slice(0, 50),
        errorText: redactDiagnostic(
          request.failure()?.errorText ?? "Request failed",
          secrets,
        ).slice(0, 2000),
      });
    });

    const deploymentUrl = await assertSafeCaptureUrl(deploymentBaseUrl, { allowLocalhost });
    await runLoginSetup(
      page,
      deploymentUrl,
      job.auth_config.loginSetup,
      job.capture_options.timeoutMs,
      secrets,
    );
    const targetUrl = new URL(job.resolved_path, deploymentUrl.origin);
    await assertSafeCaptureUrl(targetUrl.toString(), { allowLocalhost });
    const navigationResponse = await page.goto(targetUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: job.capture_options.timeoutMs,
    });
    if (safetyError) throw safetyError;
    await stabilizePage(page, job.capture_options);
    if (safetyError) throw safetyError;
    await assertSafeCaptureUrl(page.url(), { allowLocalhost });

    if (job.capture_options.disableAnimations) {
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}",
      });
    }
    await applyHiddenSelectors(page, job.capture_options.hideSelectors);
    const dimensions = await page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    }));
    if (
      dimensions.width > MAX_PAGE_DIMENSION ||
      dimensions.height > MAX_PAGE_DIMENSION ||
      dimensions.width * dimensions.height > MAX_PAGE_PIXELS
    ) {
      throw new CaptureJobError(
        "PAGE_SIZE_LIMIT",
        "The rendered page exceeds the capture dimension limit.",
      );
    }
    const masks = job.capture_options.maskSelectors.map((selector) => page!.locator(selector));
    const screenshotOptions = {
      animations: job.capture_options.disableAnimations
        ? ("disabled" as const)
        : ("allow" as const),
      caret: "hide" as const,
      mask: masks,
      timeout: job.capture_options.timeoutMs,
      type: "png" as const,
    };
    const viewportImage = Buffer.from(
      await page.screenshot({ ...screenshotOptions, fullPage: false }),
    );
    const fullPage = Buffer.from(await page.screenshot({ ...screenshotOptions, fullPage: true }));
    for (const artifact of [viewportImage, fullPage]) {
      if (artifact.byteLength > MAX_CAPTURE_ARTIFACT_BYTES) {
        throw new CaptureJobError(
          "ARTIFACT_SIZE_LIMIT",
          "A screenshot exceeded the existing 8 MB board-media storage limit.",
        );
      }
    }
    return {
      fullPage,
      viewportImage,
      finalUrl: sanitizeUrl(page.url()),
      httpStatus: navigationResponse?.status() ?? null,
      consoleErrors,
      pageErrors,
      failedRequests,
      viewport: job.viewport,
      pageWidth: Math.round(dimensions.width),
      pageHeight: Math.round(dimensions.height),
      captureDurationMs: Date.now() - startedAt,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function captureBaseAndPr(job: CaptureJob): Promise<RawCapturePair> {
  const startedAt = Date.now();
  const browser = await chromium.launch({
    executablePath: process.env.CAPTURE_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
    headless: true,
    args: ["--disable-background-networking", "--disable-extensions", "--disable-sync"],
  });
  let deadlineReached = false;
  const maximumDurationMs = Math.min(job.capture_options.timeoutMs * 2 + 30_000, 270_000);
  const deadline = setTimeout(() => {
    deadlineReached = true;
    void browser.close();
  }, maximumDurationMs);
  try {
    const base = await captureTarget(browser, job, job.base_url);
    const pr = await captureTarget(browser, job, job.preview_url);
    if (deadlineReached) {
      throw new CaptureJobError(
        "CAPTURE_TIMEOUT",
        `The capture exceeded the ${maximumDurationMs} ms execution limit.`,
      );
    }
    return { base, pr, durationMs: Date.now() - startedAt };
  } catch (error) {
    if (deadlineReached) {
      throw new CaptureJobError(
        "CAPTURE_TIMEOUT",
        `The capture exceeded the ${maximumDurationMs} ms execution limit.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => undefined);
  }
}
