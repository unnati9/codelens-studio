import type { PreviewDeploymentProvider } from "@/lib/preview-deployments/provider";
import { VercelPreviewProvider } from "@/lib/preview-deployments/vercel";
import type { PreviewDeploymentProvider as PreviewDeploymentProviderName } from "@/lib/validation/board";

export function getPreviewDeploymentProvider(
  provider: PreviewDeploymentProviderName,
): PreviewDeploymentProvider {
  switch (provider) {
    case "VERCEL":
      return new VercelPreviewProvider();
  }
}
