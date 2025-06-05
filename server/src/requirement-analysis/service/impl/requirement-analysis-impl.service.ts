import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigType } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { PrismaClient } from '.prisma/client';
import { llMConfig } from '@server/config/llm.config';
import { RequirementAnalysisService } from '@server/requirement-analysis/service/requirement-analysis.service';
import { AnalyzeRequirementDto } from '@server/requirement-analysis/dto/analyze-requirement.dto';
import { PRISMA_REPOSITORY } from '@server/constants';

@Injectable()
export class RequirementAnalysisServiceImpl implements RequirementAnalysisService {
  private readonly logger = new Logger(RequirementAnalysisServiceImpl.name);

  constructor(
    private readonly httpService: HttpService,

    @Inject(llMConfig.KEY)
    private config: ConfigType<typeof llMConfig>,
    
    @Inject(PRISMA_REPOSITORY)
    private prismaRepository: PrismaClient,
  ) {}

  /**
   * 分析並理解需求文本
   * @param requirementText 需求文本
   * @param language 目標程式語言
   * @param templateId 可選的模板ID
   * @returns 結構化的需求分析
   */
  public async analyzeRequirement(requirement: AnalyzeRequirementDto): Promise<Record<string, any>> {
    const { requirementText, language, templateId } = requirement;
    this.logger.log(`Analyzing requirement for ${language}${templateId ? ' with template' : ''}`);
    
    // 獲取語言特定的模板內容（如果有）
    let templateContent = '';
    if (templateId) {
      const template = await this.prismaRepository.codeTemplate.findFirst({
        where: {
          id: templateId,
        },
        rejectOnNotFound: false,
      });
      if (template) {
        templateContent = template.template_content;
      }
    }
    
    const prompt = `
      分析以下軟體需求並將其分解為結構化組件。
      代碼將使用 ${language} 實現。
      
      需求:
      ${requirementText}
      
      ${templateId ? `使用以下模板作為基礎：\n${templateContent}\n` : ''}
      
      請提供：
      1. 這個需求的明確標題
      2. 請求的主要功能
      3. 所需的關鍵組件或模塊
      4. 預期的輸入和輸出
      5. 提到的任何依賴項或約束條件
      6. 建議的實現文件結構
      7. 實現策略和方法
      
      以JSON格式返回結果，包含以下字段：
      {
        "title": "需求標題",
        "functionality": "主要功能描述",
        "components": ["組件1", "組件2", ...],
        "inputsOutputs": "輸入輸出說明",
        "dependencies": "依賴項和約束條件",
        "fileStructure": ["文件1.ts", "文件2.ts", ...],
        "implementationStrategy": "實現策略描述"
      }
    `;

    const result = await this.callLlmApi(prompt);

    try {
      // 嘗試直接解析為JSON
      return JSON.parse(result);
    } catch (error) {
      // 備用方案：從文本響應中提取JSON
      this.logger.warn(`Failed to parse LLM response as JSON, attempting to extract JSON`);
      return this.extractJsonFromText(result);
    }
  }

  /**
   * 從文本中提取JSON對象
   * @param text 包含JSON的文本
   * @private
   */
  private extractJsonFromText(text: string): Record<string, any> {
    // 嘗試在文本中找到JSON塊
    const jsonBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```|({[\s\S]*?})/;
    const match = text.match(jsonBlockRegex);
    
    if (match && (match[1] || match[2])) {
      try {
        return JSON.parse(match[1] || match[2]);
      } catch (error) {
        this.logger.error(`Failed to parse extracted JSON block: ${error.message}`);
      }
    }
    
    // 使用結構化方式從文本中提取信息
    const result: Record<string, any> = {
      title: this.extractSection(text, 'title'),
      functionality: this.extractSection(text, 'main functionality'),
      components: this.extractComponents(text),
      inputsOutputs: this.extractSection(text, 'inputs and outputs'),
      dependencies: this.extractSection(text, 'dependencies or constraints'),
      fileStructure: this.extractFileStructure(text),
      implementationStrategy: this.extractSection(text, 'implementation strategy'),
    };
    
    return result;
  }

  /**
   * 從LLM響應中提取特定部分
   * @param text LLM響應文本
   * @param section 要提取的部分名稱
   * @private
   */
  private extractSection(text: string, section: string): string {
    const sectionRegex = new RegExp(`(?:${section}|\\d+\\.\\s*(?:[\\w\\s]+${section}[\\w\\s]+)):?\\s*([\\s\\S]*?)(?:\\n\\s*\\d+\\.|\\n\\s*(?:[A-Z]|\\w+:)|$)`, 'i');
    const match = text.match(sectionRegex);
    return match ? match[1].trim() : '';
  }

  /**
   * 從LLM響應中提取組件
   * @param text LLM響應文本
   * @private
   */
  private extractComponents(text: string): string[] {
    // 嘗試找到組件部分
    const componentsSection = this.extractSection(text, 'components|modules');
    
    if (!componentsSection) {
      return [];
    }
    
    // 按項目符號或編號項目拆分
    const componentLines = componentsSection.split(/\n\s*[-*•]|\n\s*\d+\.\s+/).filter(Boolean);
    
    return componentLines.map(line => line.trim());
  }

  /**
   * 從LLM響應中提取文件結構
   * @param text LLM響應文本
   * @private
   */
  private extractFileStructure(text: string): string[] {
    const fileStructureSection = this.extractSection(text, 'file structure');
    
    if (!fileStructureSection) {
      return [];
    }
    
    // 按項目符號、編號項目或文件路徑拆分
    const fileLines = fileStructureSection.split(/\n\s*[-*•]|\n\s*\d+\.\s+|\n\s*(?:\/|\\)/).filter(Boolean);
    
    return fileLines.map(line => {
      // 清理文件路徑
      const cleaned = line.trim().replace(/^(?:\/|\\|-\s*|•\s*|\d+\.\s*)/, '');
      return cleaned;
    });
  }

  /**
   * 調用LLM API
   * @param prompt 發送到LLM的提示
   * @private
   */
  private async callLlmApi(prompt: string): Promise<string> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          this.config.llmApiUrl,
          {
            model: this.config.llmApiModel,
            messages: [
              { role: 'system', content: '你是一個專門用於軟體開發的助手，專長於理解和解析軟體需求。你需要將自然語言需求分解為結構化的組件，以便於後續的代碼生成。' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.llmApiKey}`,
            },
          }
        ),
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      this.logger.error(`Error calling LLM API: ${error.message}`);
      throw new Error(`Failed to call LLM API: ${error.message}`);
    }
  }
}