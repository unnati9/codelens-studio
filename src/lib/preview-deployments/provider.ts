import type {
  PreviewConnectionResponse,
  PreviewDeploymentDiscovery,
} from "@/lib/preview-deployments/schema";

export type PreviewDeploymentProviderConfig = {
  projectId: string;
  teamId: string | null;
  productionUrl: string;
};

export type PreviewDeploymentDiscoveryInput = PreviewDeploymentProviderConfig & {
  headCommitSha: string;
  headBranch: string;
};

export interface PreviewDeploymentProvider {
  readonly provider: "VERCEL";
  testConnection(config: PreviewDeploymentProviderConfig): Promise<PreviewConnectionResponse>;
  discover(input: PreviewDeploymentDiscoveryInput): Promise<PreviewDeploymentDiscovery>;
}
