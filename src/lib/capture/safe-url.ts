import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CaptureJobError } from "@/lib/capture/service";

type ResolveAddress = { address: string; family: number };

export type CaptureUrlSafetyOptions = {
  allowLocalhost?: boolean;
  resolve?: (hostname: string) => Promise<ResolveAddress[]>;
};

function ipv4Number(address: string) {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => value * 256 + octet, 0);
}

function inIpv4Range(address: string, start: string, bits: number) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(start) & mask);
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([start, bits]) => inIpv4Range(normalized, String(start), Number(bits)));
  }
  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("::ffff:")
    );
  }
  return true;
}

function isLoopbackAddress(address: string) {
  return address === "::1" || (isIP(address) === 4 && inIpv4Range(address, "127.0.0.0", 8));
}

async function defaultResolve(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function assertSafeCaptureUrl(
  input: string,
  options: CaptureUrlSafetyOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CaptureJobError("UNSAFE_CAPTURE_URL", "Capture target URL is invalid.", 400);
  }
  if (!["https:", ...(options.allowLocalhost ? ["http:"] : [])].includes(url.protocol)) {
    throw new CaptureJobError("UNSAFE_CAPTURE_URL", "Capture targets must use HTTPS.", 400);
  }
  if (url.username || url.password) {
    throw new CaptureJobError(
      "UNSAFE_CAPTURE_URL",
      "Capture target URLs cannot contain credentials.",
      400,
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let addresses: ResolveAddress[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await (options.resolve ?? defaultResolve)(hostname);
    } catch {
      throw new CaptureJobError(
        "CAPTURE_DNS_FAILED",
        "The capture target hostname could not be resolved.",
        400,
      );
    }
  }
  if (addresses.length === 0) {
    throw new CaptureJobError("CAPTURE_DNS_FAILED", "The capture target has no address.", 400);
  }
  for (const { address } of addresses) {
    if (
      isPrivateNetworkAddress(address) &&
      !(options.allowLocalhost && isLoopbackAddress(address))
    ) {
      throw new CaptureJobError(
        "SSRF_BLOCKED",
        "Capture targets and page resources must resolve to public network addresses.",
        400,
      );
    }
  }
  url.hash = "";
  return url;
}
