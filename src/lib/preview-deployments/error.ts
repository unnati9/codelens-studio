export class PreviewDeploymentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "PreviewDeploymentError";
    this.code = code;
    this.status = status;
  }
}

export function asPreviewDeploymentError(error: unknown): PreviewDeploymentError {
  if (error instanceof PreviewDeploymentError) return error;
  return new PreviewDeploymentError(
    "PREVIEW_DISCOVERY_FAILED",
    error instanceof Error ? error.message : "Preview deployment discovery failed.",
    500,
  );
}
