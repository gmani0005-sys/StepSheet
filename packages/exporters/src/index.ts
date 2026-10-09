import { PipelineDefinition } from '@stepsheet/step-spec';

export interface Exporter {
  export(pipeline: PipelineDefinition): string;
}

export class SQLExporter implements Exporter {
  export(pipeline: PipelineDefinition): string {
    return `-- StepSheet Generated SQL Pipeline: ${pipeline.name}\nSELECT * FROM source_dataset;`;
  }
}

export class PolarsExporter implements Exporter {
  export(pipeline: PipelineDefinition): string {
    return `# StepSheet Generated Python Polars Script: ${pipeline.name}\nimport polars as pl\n\ndf = pl.read_parquet("dataset.parquet")\n`;
  }
}
