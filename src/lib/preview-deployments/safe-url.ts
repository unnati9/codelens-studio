import { isIP } from "node:net";
import { PreviewDeploymentError } from "@/lib/preview-deployments/error";

const blockedHostSuffixes = [".internal", ".local", ".localhost", ".home", ".lan"];

function isLocalDevelopmentHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function validatePreviewDeploymentUrl(
  input: string,
  environment = process.env.NODE_ENV,
): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PreviewDeploymentError("INVALID_PREVIEW_URL", "Enter a valid deployment URL.", 400);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const localDevelopment = environment !== "production" && isLocalDevelopmentHost(hostname);
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new PreviewDeploymentError(
      "INSECURE_PREVIEW_URL",
      "Deployment URLs must use HTTPS. HTTP is allowed only for local development.",
      400,
    );
  }
  if (url.username || url.password) {
    throw new PreviewDeploymentError(
      "INVALID_PREVIEW_URL",
      "Deployment URLs cannot contain credentials.",
      400,
    );
  }
  if (
    !localDevelopment &&
    (isIP(hostname) !== 0 ||
      hostname === "localhost" ||
      blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix)))
  ) {
    throw new PreviewDeploymentError(
      "UNSAFE_PREVIEW_URL",
      "Deployment URLs must use a public hostname.",
      400,
    );
  }

  url.hash = "";
  return url.toString();
}

export function vercelDeploymentUrl(hostOrUrl: string): string {
  const value = /^https?:\/\//i.test(hostOrUrl) ? hostOrUrl : `https://${hostOrUrl}`;
  return validatePreviewDeploymentUrl(value, "production");
}
