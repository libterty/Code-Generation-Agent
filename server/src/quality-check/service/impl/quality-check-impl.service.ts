import { Injectable, Logger, Inject } from '@nestjs/common';
import * as path from 'path';
import { PrismaClient, QualityMetric, CodeLanguage } from '.prisma/client';
import { LLMProvider } from '@server/config/llm.config';
import { QualityCheckService } from '@server/quality-check/service/quality-check.service';
import { LLMIntegrationService } from '@server/core/llm/service/llm-integration.service';
import { PRISMA_REPOSITORY, LLM_INTEGRATION_SERVICE } from '@server/constants';

@Injectable()
export class QualityCheckServiceImpl implements QualityCheckService {
  private readonly logger = new Logger(QualityCheckServiceImpl.name);

  constructor(
    @Inject(PRISMA_REPOSITORY)
    private prismaRepository: PrismaClient,

    @Inject(LLM_INTEGRATION_SERVICE)
    private readonly llmIntegrationService: LLMIntegrationService,
  ) {}

  /**
   * 檢查生成的程式碼品質
   * @param generatedCode 生成的程式碼
   * @param requirementAnalysis 需求分析
   * @param language 程式語言
   * @param taskId 相關任務 ID
   * @returns 品質評估結果
   */
  public async checkCodeQuality(
    generatedCode: Record<string, string>,
    requirementAnalysis: Record<string, any>,
    language: CodeLanguage,
    taskId: string,
  ): Promise<{
    passed: boolean;
    codeQualityScore: number;
    requirementCoverageScore: number;
    syntaxValidityScore: number;
    feedback: string;
  }> {
    this.logger.log(`Checking code quality for task ${taskId}`);

    // 1. 進行基本語法檢查
    const syntaxValidityScore = await this.validateSyntax(
      generatedCode,
      language,
    );

    // 2. 要求 LLM 評估代碼質量
    const evaluation = await this.evaluateCodeQuality(
      generatedCode,
      requirementAnalysis,
      language,
    );

    // 3. 計算需求覆蓋率
    const requirementCoverageScore = await this.calculateRequirementCoverage(
      generatedCode,
      requirementAnalysis,
    );

    // 4. 確定整體品質分數是否通過閾值
    const overallScore =
      evaluation.codeQualityScore * 0.5 +
      requirementCoverageScore * 0.3 +
      syntaxValidityScore * 0.2;

    const passed = overallScore >= 85; // 85% 閾值

    // 5. 儲存品質指標
    await this.saveQualityMetrics(
      taskId,
      evaluation.codeQualityScore,
      requirementCoverageScore,
      syntaxValidityScore,
      evaluation.staticAnalysisResults,
      evaluation.feedback,
    );

    return {
      passed,
      codeQualityScore: evaluation.codeQualityScore,
      requirementCoverageScore,
      syntaxValidityScore,
      feedback: evaluation.feedback,
    };
  }

  /**
   * 驗證程式碼語法
   * @param generatedCode 生成的程式碼
   * @param language 程式語言
   * @private
   */
  private async validateSyntax(
    generatedCode: Record<string, string>,
    language: string,
  ): Promise<number> {
    // 這裡可以整合具體的語法檢查工具，如 ESLint/TSLint/Pylint 等
    // 本示例中，我們使用 LLM 進行基本語法檢查

    const fileEntries = Object.entries(generatedCode);
    let validCount = 0;

    for (const [filePath, content] of fileEntries) {
      // 檢查檔案是否為有效的程式碼檔案
      if (this.isCodeFile(filePath, language)) {
        const isValid = await this.validateFileContent(content, language);
        if (isValid) {
          validCount++;
        }
      }
    }

    // 計算語法有效性分數 (0-100)
    return fileEntries.length > 0 ? (validCount / fileEntries.length) * 100 : 0;
  }

  /**
   * 判斷檔案是否為程式碼檔案
   * @param filePath 檔案路徑
   * @param language 程式語言
   * @private
   */
  private isCodeFile(filePath: string, language: string): boolean {
    const extensions = {
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx'],
      python: ['.py'],
      java: ['.java'],
      go: ['.go'],
      rust: ['.rs'],
      'c++': ['.cpp', '.hpp', '.h'],
      'c#': ['.cs'],
    };

    const ext = path.extname(filePath).toLowerCase();
    return extensions[language]?.includes(ext) || false;
  }

  /**
   * 驗證檔案內容的語法
   * @param content 檔案內容
   * @param language 程式語言
   * @private
   */
  private async validateFileContent(
    content: string,
    language: string,
  ): Promise<boolean> {
    try {
      // 此處可整合語法檢查工具
      // 目前透過 LLM 進行基本檢查
      const prompt = `
        請檢查以下 ${language} 程式碼的基本語法。
        不需要評估程式碼質量或風格，只需確認是否存在明顯的語法錯誤。
        
        程式碼:
        \`\`\`${language}
        ${content}
        \`\`\`
        
        只回答 "valid" 或 "invalid"，後面附上發現的主要語法錯誤（如果有）。
      `;

      const result = await this.llmIntegrationService.callLLmApi({
        prompt,
        options: {
          provider: LLMProvider.OLLAMA_DEEPSEEK_CHAT,
          temperature: 0.2,
          useFallback: true,
        },
      });
      return result.toLowerCase().trim().startsWith('valid');
    } catch (error) {
      this.logger.error(`Error validating file content: ${error.message}`);
      return false;
    }
  }

  /**
   * 評估程式碼品質
   * @param generatedCode 生成的程式碼
   * @param requirementAnalysis 需求分析
   * @param language 程式語言
   * @private
   */
  private async evaluateCodeQuality(
    generatedCode: Record<string, string>,
    requirementAnalysis: Record<string, any>,
    language: string,
  ): Promise<{
    codeQualityScore: number;
    staticAnalysisResults: Record<string, any>;
    feedback: string;
  }> {
    // 準備程式碼樣本用於評估
    const codeSnippets = Object.entries(generatedCode)
      .map(
        ([path, content]) =>
          `File: ${path}\n\n${content.substring(0, 1000)}${
            content.length > 1000 ? '...' : ''
          }`,
      )
      .join('\n\n========\n\n')
      .substring(0, 8000); // 限制提示大小

    const prompt = `
      作為專業的程式碼審查員，請評估以下程式碼是否符合需求，並評估其品質。
      
      需求分析:
      ${JSON.stringify(requirementAnalysis, null, 2)}
      
      程式碼樣本:
      ${codeSnippets}
      
      請從以下幾個方面評估程式碼 (滿分 100 分):
      1. 程式碼正確性 (是否正確實現需求功能): 30 分
      2. 程式碼完整性 (是否實現了所有需求): 25 分
      3. 程式碼品質 (結構、可維護性、遵循最佳實踐): 25 分
      4. 錯誤處理 (是否適當處理潛在錯誤): 10 分
      5. 安全性 (是否避免常見安全漏洞): 10 分
      
      請以 JSON 格式回覆:
      {
        "totalScore": 分數,
        "scores": {
          "correctness": 分數,
          "completeness": 分數,
          "codeQuality": 分數,
          "errorHandling": 分數,
          "security": 分數
        },
        "feedback": "簡要反饋",
        "issues": ["問題1", "問題2", ...]
      }
    `;

    try {
      const result = await this.llmIntegrationService.callLLmApi({
        prompt,
        options: {
          provider: LLMProvider.OLLAMA_DEEPSEEK_CHAT,
          temperature: 0.2,
          useFallback: true,
        },
      });
      const evaluation = JSON.parse(result);

      return {
        codeQualityScore: evaluation.totalScore,
        staticAnalysisResults: evaluation.scores,
        feedback: evaluation.feedback,
      };
    } catch (error) {
      this.logger.error(`Error evaluating code quality: ${error.message}`);
      return {
        codeQualityScore: 0,
        staticAnalysisResults: {},
        feedback: `評估失敗: ${error.message}`,
      };
    }
  }

  /**
   * 計算需求覆蓋率
   * @param generatedCode 生成的程式碼
   * @param requirementAnalysis 需求分析
   * @private
   */
  private async calculateRequirementCoverage(
    generatedCode: Record<string, string>,
    requirementAnalysis: Record<string, any>,
  ): Promise<number> {
    // 提取需求中的關鍵元素
    const requiredComponents = requirementAnalysis.components || [];
    const functionality = requirementAnalysis.functionality || '';
    const fileStructure = requirementAnalysis.fileStructure || [];

    // 準備程式碼內容
    const allCode = Object.values(generatedCode).join('\n');

    // 檢查文件結構覆蓋率
    let fileStructureCoverage = 0;
    if (fileStructure.length > 0) {
      const generatedFiles = Object.keys(generatedCode).map((f) =>
        path.basename(f),
      );
      let matchCount = 0;

      for (const requiredFile of fileStructure) {
        const basename = path.basename(requiredFile);
        if (
          generatedFiles.some(
            (f) => f === basename || f.includes(basename.replace(/\.\w+$/, '')),
          )
        ) {
          matchCount++;
        }
      }

      fileStructureCoverage = matchCount / fileStructure.length;
    } else {
      fileStructureCoverage = 1; // 如果沒有指定文件結構，則視為全部覆蓋
    }

    // 使用 LLM 評估功能覆蓋率
    const prompt = `
      評估生成的程式碼是否覆蓋了需求中的所有關鍵功能和組件。
      
      需求功能:
      ${functionality}
      
      需求組件:
      ${requiredComponents.join('\n')}
      
      生成的程式碼內容:
      ${allCode.substring(0, 8000)}
      
      請給出覆蓋率評分 (0-100)，並簡單說明原因。
      只需回覆 JSON 格式:
      {
        "coverageScore": 分數,
        "reason": "理由"
      }
    `;

    try {
      const result = await this.llmIntegrationService.callLLmApi({
        prompt,
        options: {
          provider: LLMProvider.OLLAMA_DEEPSEEK_CHAT,
          temperature: 0.2,
          useFallback: true,
        },
      });
      const evaluation = JSON.parse(result);

      // 綜合文件結構覆蓋率和功能覆蓋率
      return (fileStructureCoverage * 30 + evaluation.coverageScore * 70) / 100;
    } catch (error) {
      this.logger.error(
        `Error calculating requirement coverage: ${error.message}`,
      );
      return fileStructureCoverage * 100; // 如果 LLM 評估失敗，則僅使用文件結構覆蓋率
    }
  }

  /**
   * 儲存品質指標
   * @param taskId 任務 ID
   * @param codeQualityScore 程式碼品質分數
   * @param requirementCoverageScore 需求覆蓋率分數
   * @param syntaxValidityScore 語法有效性分數
   * @param staticAnalysisResults 靜態分析結果
   * @param feedback 反饋
   * @private
   */
  private async saveQualityMetrics(
    taskId: string,
    codeQualityScore: number,
    requirementCoverageScore: number,
    syntaxValidityScore: number,
    staticAnalysisResults: Record<string, any>,
    feedback: string,
  ): Promise<QualityMetric> {
    const metrics = await this.prismaRepository.qualityMetric.create({
      data: {
        task_id: taskId,
        code_quality_score: codeQualityScore,
        requirement_coverage_score: requirementCoverageScore,
        syntax_validity_score: syntaxValidityScore,
        static_analysis_results: JSON.stringify(staticAnalysisResults),
        feedback,
      },
    });

    return metrics;
  }
}
