import { Injectable, Logger } from '@nestjs/common';
import { AnalysisResult, FeaturePriority, ConstraintType } from '@server/requirement-analysis/service/requirement-analysis.service';
import { StructuralAnalyzerProvider } from '@server/requirement-analysis/provider/structural-analyzer.provider';

@Injectable()
export class StructuralAnalyzerProviderImpl implements StructuralAnalyzerProvider {
  private readonly logger = new Logger(StructuralAnalyzerProviderImpl.name);

  /**
   * 處理 LLM 回傳的原始分析結果，進行結構化與標準化
   * @param rawAnalysis LLM 回傳的原始分析結果
   * @returns 標準化的結構化分析結果
   */
  process(rawAnalysis: any): AnalysisResult {
    try {
      // 確保輸入是有效的物件
      if (!rawAnalysis || typeof rawAnalysis !== 'object') {
        throw new Error('無效的分析結果');
      }

      // 標準化特徵
      const features = Array.isArray(rawAnalysis.features)
        ? rawAnalysis.features.map(feature => ({
            name: feature.name || '未命名特徵',
            description: feature.description || '',
            priority: this.normalizePriority(feature.priority),
          }))
        : [];

      // 標準化實體
      const entities = Array.isArray(rawAnalysis.entities)
        ? rawAnalysis.entities.map(entity => ({
            name: entity.name || '未命名實體',
            attributes: Array.isArray(entity.attributes) ? entity.attributes : [],
            relationships: Array.isArray(entity.relationships) ? entity.relationships : [],
          }))
        : [];

      // 標準化約束
      const constraints = Array.isArray(rawAnalysis.constraints)
        ? rawAnalysis.constraints.map(constraint => ({
            type: this.normalizeConstraintType(constraint.type),
            description: constraint.description || '',
          }))
        : [];

      // 標準化技術堆疊
      const technicalStack = {
        frontend: Array.isArray(rawAnalysis.technicalStack?.frontend)
          ? rawAnalysis.technicalStack.frontend
          : [],
        backend: Array.isArray(rawAnalysis.technicalStack?.backend)
          ? rawAnalysis.technicalStack.backend
          : [],
        database: Array.isArray(rawAnalysis.technicalStack?.database)
          ? rawAnalysis.technicalStack.database
          : [],
        devops: Array.isArray(rawAnalysis.technicalStack?.devops)
          ? rawAnalysis.technicalStack.devops
          : [],
      };

      // 組合最終結果
      return {
        features,
        entities,
        constraints,
        technicalStack,
        metadata: rawAnalysis.metadata || {},
      };
    } catch (error) {
      this.logger.error('結構化分析處理失敗:', error);
      // 返回空的預設結構
      return {
        features: [],
        entities: [],
        constraints: [],
        technicalStack: {
          frontend: [],
          backend: [],
          database: [],
          devops: [],
        },
      };
    }
  }

  /**
   * 標準化優先級
   * @param priority 原始優先級值
   * @returns 標準化的優先級
   */
  private normalizePriority(priority: string): FeaturePriority {
    if (!priority) return FeaturePriority.MEDIUM;
    
    const lowerPriority = priority.toLowerCase();
    if (lowerPriority.includes('嚴重') || lowerPriority.includes('critical')) {
      return FeaturePriority.CRITICAL;
    } else if (lowerPriority.includes('高') || lowerPriority.includes('high')) {
      return FeaturePriority.HIGH;
    } else if (lowerPriority.includes('低') || lowerPriority.includes('low')) {
      return FeaturePriority.LOW;
    } else {
      return FeaturePriority.MEDIUM;
    }
  }

  /**
   * 標準化約束類型
   * @param type 原始約束類型
   * @returns 標準化的約束類型
   */
  private normalizeConstraintType(type: string): ConstraintType {
    if (!type) return ConstraintType.TECHNICAL;
    
    const lowerType = type.toLowerCase();
    
    if (lowerType.includes('業務') || lowerType.includes('business')) {
      return ConstraintType.BUSINESS;
    } else if (lowerType.includes('安全') || lowerType.includes('security')) {
      return ConstraintType.BUSINESS;
    } else {
      return ConstraintType.TECHNICAL;
    }
  }
}
