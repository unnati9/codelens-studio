import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  githubOAuthTransactionSchema,
  githubSessionSchema,
  type GitHubOAuthTransaction,
  type GitHubSession,
} from "@/lib/github/auth/schema";

const encryptionVersion = "v1";
const sessionAssociatedData = Buffer.from("codelens-github-session:v1", "utf8");
const oauthTransactionLifetimeMs = 10 * 60 * 1000;

function keyFromSecret(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(purpose).update("\0").update(secret).digest();
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createOAuthTransaction(now = Date.now(), returnTo = "/"): GitHubOAuthTransaction {
  return githubOAuthTransactionSchema.parse({
    version: 1,
    state: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(64).toString("base64url"),
    createdAt: now,
    returnTo,
  });
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

export function signOAuthTransaction(transaction: GitHubOAuthTransaction, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify(githubOAuthTransactionSchema.parse(transaction)),
  ).toString("base64url");
  const signature = createHmac("sha256", keyFromSecret(secret, "oauth-transaction"))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthTransaction(
  value: string | undefined,
  expectedState: string,
  secret: string,
  now = Date.now(),
): GitHubOAuthTransaction | null {
  if (!value) return null;
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = createHmac("sha256", keyFromSecret(secret, "oauth-transaction"))
    .update(payload)
    .digest("base64url");
  if (!safeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const transaction = githubOAuthTransactionSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (now - transaction.createdAt > oauthTransactionLifetimeMs || now < transaction.createdAt) {
      return null;
    }
    return safeEqual(transaction.state, expectedState) ? transaction : null;
  } catch {
    return null;
  }
}

export function encryptGitHubSession(session: GitHubSession, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret, "session-encryption"), iv);
  cipher.setAAD(sessionAssociatedData);
  const plaintext = Buffer.from(JSON.stringify(githubSessionSchema.parse(session)), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    encryptionVersion,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptGitHubSession(
  value: string | undefined,
  secret: string,
): GitHubSession | null {
  if (!value) return null;
  const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] = value.split(".");
  if (
    version !== encryptionVersion ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedAuthTag ||
    extra
  ) {
    return null;
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFromSecret(secret, "session-encryption"),
      iv,
    );
    decipher.setAAD(sessionAssociatedData);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    return githubSessionSchema.parse(JSON.parse(plaintext));
  } catch {
    return null;
  }
}
