import { AnalysisResult } from '@server/requirement-analysis/service/requirement-analysis.service';

export interface StructuralAnalyzerProvider {
  process(raw: any): AnalysisResult;
}
