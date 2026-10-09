export interface StepDefinition<TParams = Record<string, any>> {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  params: TParams;
  description?: string;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  sourceDatasetId: string;
  steps: StepDefinition[];
  version: number;
}
