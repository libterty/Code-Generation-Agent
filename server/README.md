# Code Generation Agent

## 專案目錄結構

```
code-generation-agent/
├── src/
│   ├── main.ts                        # 應用程式入口點
│   ├── app.module.ts                  
│   ├── app.controller.ts              
│   ├── app.service.ts                 
│   ├── config/                        # 配置模組
│   │   ├── general.ts
│   │   ├── auth.config.ts
│   │   ├── config.validtor.ts
│   │   ├── db.config.ts
│   │   ├── llm.config.ts
│   │   ├── redis.config.ts
│   │   ├── task-queue.config.ts
│   │   └── git.config.ts
│   ├── core/                          # 共用模組
│   │   ├── atuh/                      
│   │   ├── error/                     
│   │   ├── interceptor/                
│   │   ├── mapper/                    
│   │   ├── pipe/                  
│   │   ├── prisma/                   
│   │   ├── redis/                    
│   │   ├── llm/                   
│   │   ├── cache-manager/                  
│   │   └── utils/                
│   ├── modules/                       
│   │   ├── requirement-analysis/      # 需求解析與理解模組
│   │   │   ├── controller
│   │   │   ├── service
│   │   │   ├── dto/
│   │   │   ├── interfaces/
│   │   │   └── providers/             # LLM 整合與結構化分析
│   │   ├── code-generation/           # 程式碼生成模組
│   │   │   ├── service
│   │   │   ├── event
│   │   │   ├── event-listener
│   │   │   ├── dto/
│   │   │   ├── interfaces/
│   │   │   ├── templates/             # 程式碼模板
│   │   │   └── generators/            # 各語言生成器
│   │   └── git-integration/           # Git 自動化操作模組
│   │   │   ├── service
│   │   │   ├── event
│   │   │   ├── event-listener
│   │   │   ├── dto/
│   │   │   ├── interfaces/
│   │   │   └── providers/
├── nest-cli.json                      # NestJS CLI 配置
├── package.json                       # 專案依賴
├── tsconfig.json                      # TypeScript 配置
├── tsconfig.build.json                # 建置用 TypeScript 配置
└── README.md                          # 專案說明
```

## 核心模組設計

### 1. 需求解析與理解模組 (Requirement Analysis Module)

負責接收自然語言需求，使用 LLM 進行解析，並轉換為結構化資料。

**主要介面**:

```typescript
// 需求解析介面
export interface IRequirementAnalyzer {
  analyze(requirement: string): Promise<AnalysisResult>;
}

// 結構化分析結果
export interface AnalysisResult {
  features: Feature[];
  entities: Entity[];
  constraints: Constraint[];
  technicalStack: TechnicalStack;
  metadata: Record<string, any>;
}
```

**核心服務**:

- `RequirementAnalysisService`: 協調 LLM 解析與結構化處理
- `LlmRequirementProvider`: 與 LLM 後端 API 整合
- `StructuralAnalyzer`: 將 LLM 回應轉換為結構化資料

### 2. 程式碼生成模組 (Code Generation Module)

基於需求分析結果，使用模板與動態生成方式產生多語言程式碼。

**主要介面**:

```typescript
// 程式碼生成器介面
export interface ICodeGenerator {
  generate(analysisResult: AnalysisResult): Promise<GeneratedCode[]>;
  supportedLanguages(): string[];
}

// 程式碼模板介面
export interface ICodeTemplate {
  apply(data: TemplateData): string;
  getType(): TemplateType;
}

// 生成的程式碼
export interface GeneratedCode {
  language: string;
  files: CodeFile[];
}

// 程式碼檔案
export interface CodeFile {
  path: string;
  content: string;
  type: FileType;
}
```

**核心服務**:

- `CodeGenerationService`: 協調程式碼生成流程
- `TemplateManager`: 管理各種程式碼模板
- `LanguageGeneratorFactory`: 根據語言選擇適當的生成器
- 各語言生成器: `TypeScriptGenerator`, `JavaGenerator`, `PythonGenerator` 等

### 3. Git 自動化操作模組 (Git Integration Module)

處理程式碼的 Git 操作，包括 commit 與 push。

**主要介面**:

```typescript
// Git 操作介面
export interface IGitOperator {
  initialize(options: GitInitOptions): Promise<void>;
  commit(message: string, files: string[]): Promise<string>;
  push(remote?: string, branch?: string): Promise<void>;
  createPullRequest(options: PullRequestOptions): Promise<string>;
}

// Git 提供者介面
export interface IGitProvider {
  getType(): GitProviderType;
  authenticate(credentials: GitCredentials): Promise<void>;
  getRepository(owner: string, repo: string): Promise<GitRepository>;
}
```

**核心服務**:

- `GitIntegrationService`: 協調 Git 操作流程
- `GitOperationFactory`: 根據 Git 提供者類型創建操作實例
- `GitlabProvider` 和 `GithubProvider`: 實現特定 Git 平台的 API 操作

## 資料流程

1. 接收自然語言需求 → 需求解析模組
2. 需求解析結果 → 程式碼生成模組
3. 生成的程式碼 → Git 自動化操作模組
4. Git 操作結果 → 回傳給客戶端

## 擴展性考量

1. **多語言支援**:
   - 使用工廠模式和策略模式實現不同語言的程式碼生成器
   - 語言特定邏輯封裝在各自的生成器中

2. **LLM 提供者**:
   - 抽象 LLM 服務介面，支援不同 LLM 提供者
   - 配置驅動的 LLM 選擇機制

3. **Git 平台整合**:
   - 抽象 Git 操作介面，支援不同 Git 平台
   - 提供者特定邏輯封裝在各自的實現中

4. **模板系統**:
   - 可擴展的模板系統，支援新增和自定義模板
   - 模板版本控制機制

## 技術整合

1. **資料庫**:
   - PostgreSQL 用於持久化需求、生成歷史等

2. **快取**:
   - Redis 用於會話管理和臨時資料儲存
   - 整合 NestJS 的 CacheModule

3. **安全性**:
   - SSH 金鑰管理用於 Git 操作
   - 權限控制系統限制操作範圍

4. **監控與日誌**:
   - 整合日誌系統記錄操作
   - 提供基本的操作指標
