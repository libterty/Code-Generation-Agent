# Code Generation Agent

## 專案概述

Code Generation Agent 是一個基於 NestJS 框架開發的智能程式碼生成系統，能夠接收自然語言需求，透過 NLP 與結構化分析將其轉換為程式碼，並自動進行 Git 操作。

本專案實現了階段一的核心功能：
1. 需求解析與理解（NLP + 結構化分析）
2. 程式碼生成（支援多語言）
3. Git 自動化操作（commit & push）

## 系統架構

專案採用模組化設計，主要包含以下核心模組：

1. **需求解析與理解模組**：負責接收自然語言需求，使用 LLM 進行解析，並轉換為結構化資料。
2. **程式碼生成模組**：基於需求分析結果，使用模板與動態生成方式產生多語言程式碼。
3. **Git 自動化操作模組**：處理程式碼的 Git 操作，包括 commit 與 push。

## 技術堆疊

- **後端框架**：NestJS
- **語言**：TypeScript
- **LLM 整合**：OpenAI API
- **Git 整合**：本地 Git 操作 + GitHub API
- **資料儲存**：預留 PostgreSQL 與 Redis 整合介面

## 安裝與設定

### 前置需求

- Node.js (v16+)
- npm 或 yarn
- Git

### 安裝步驟

1. 克隆專案：
```bash
git clone <repository-url>
cd code-generation-agent
```

2. 安裝依賴：
```bash
npm install
```

3. 環境變數設定：
創建 `.env` 檔案並設定以下變數：
```
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
GITHUB_TOKEN=your_github_token
GITHUB_USERNAME=your_github_username
GITHUB_EMAIL=your_github_email
```

4. 啟動應用：
```bash
npm run start:dev
```

## API 使用說明

### 1. 需求分析 API

**端點**：`POST /requirement-analysis/analyze`

**請求格式**：
```json
{
  "requirement": "開發一個用戶管理系統，包含用戶註冊、登入、個人資料管理功能"
}
```

**回應格式**：
```json
{
  "features": [
    {
      "name": "用戶註冊",
      "description": "允許新用戶創建帳號",
      "priority": "high"
    },
    {
      "name": "用戶登入",
      "description": "驗證用戶身份",
      "priority": "high"
    },
    {
      "name": "個人資料管理",
      "description": "允許用戶查看和更新個人資料",
      "priority": "medium"
    }
  ],
  "entities": [
    {
      "name": "用戶",
      "attributes": ["id", "username", "email", "password", "profile"],
      "relationships": []
    }
  ],
  "constraints": [
    {
      "type": "security",
      "description": "密碼需要加密儲存"
    }
  ],
  "technicalStack": {
    "frontend": ["React"],
    "backend": ["NestJS"],
    "database": ["PostgreSQL"],
    "devops": []
  }
}
```

### 2. 程式碼生成 API

**端點**：`POST /code-generation/generate`

**請求格式**：
```json
{
  "projectName": "user-management-system",
  "analysisResult": {
    // 需求分析結果（從上一步獲取）
  },
  "languages": ["typescript"],
  "outputDir": "/path/to/output"
}
```

**回應格式**：
```json
[
  {
    "language": "typescript",
    "files": [
      {
        "path": "src/entities/user.entity.ts",
        "content": "...",
        "type": "source"
      },
      {
        "path": "src/services/user-registration.service.ts",
        "content": "...",
        "type": "source"
      }
    ]
  }
]
```

### 3. Git 操作 API

**端點**：`POST /git-integration/commit-and-push`

**請求格式**：
```json
{
  "message": "Add user management features",
  "files": [
    "src/entities/user.entity.ts",
    "src/services/user-registration.service.ts"
  ],
  "remote": "origin",
  "branch": "main"
}
```

**回應格式**：
```json
{
  "commitHash": "abc123def456..."
}
```

### 4. 完整流程 API

**端點**：`POST /process-requirement`

**請求格式**：
```json
{
  "requirement": "開發一個用戶管理系統，包含用戶註冊、登入、個人資料管理功能",
  "projectName": "user-management-system",
  "languages": ["typescript"],
  "commitMessage": "Initial commit: User management system"
}
```

**回應格式**：
```json
{
  "analysisResult": {
    // 需求分析結果
  },
  "generatedCode": [
    // 生成的程式碼
  ],
  "success": true
}
```

## 擴展指南

### 新增程式語言支援

1. 在 `src/modules/code-generation/generators/` 目錄下創建新的生成器類別，實現 `ICodeGenerator` 介面。
2. 在 `src/modules/code-generation/templates/` 目錄下創建相應的模板類別。
3. 在 `CodeGenerationModule` 中註冊新的生成器。

### 整合其他 Git 提供者

1. 在 `src/modules/git-integration/providers/` 目錄下創建新的提供者類別，實現 `IGitProvider` 介面。
2. 在 `GitIntegrationModule` 中註冊新的提供者。

## 測試

執行單元測試：
```bash
npm run test
```

執行端對端測試：
```bash
npm run test:e2e
```

## 專案結構

```
code-generation-agent/
├── src/
│   ├── main.ts                        # 應用程式入口點
│   ├── app.module.ts                  # 根模組
│   ├── app.controller.ts              # 根控制器
│   ├── app.service.ts                 # 根服務
│   ├── modules/
│   │   ├── requirement-analysis/      # 需求解析與理解模組
│   │   ├── requirement-analysis/      # 需求排程
│   │   ├── code-generation/           # 程式碼生成模組
│   │   └── git-integration/           # Git 自動化操作模組
│   │   └── quality-check/             # 程式碼品質保證模組
├── test/                              # 測試目錄
├── nest-cli.json                      # NestJS CLI 配置
├── package.json                       # 專案依賴
└── README.md                          # 專案說明
```

## 未來擴展

1. **資料庫整合**：實現 PostgreSQL 連接，持久化需求與生成歷史。
2. **快取機制**：整合 Redis 用於會話管理和臨時資料儲存。
3. **更多語言支援**：擴展程式碼生成器，支援更多程式語言。
4. **CI/CD 整合**：自動化測試與部署流程。
5. **使用者介面**：開發前端介面，提供更友善的操作體驗。

## 故障排除

1. **LLM API 錯誤**：確認 OPENAI_API_KEY 環境變數已正確設定。
2. **Git 操作失敗**：確認本地 Git 已正確配置，且有適當的權限。
3. **GitHub API 錯誤**：確認 GITHUB_TOKEN 有效且具有足夠的權限。

## 授權

本專案採用 MIT 授權 - 詳見 LICENSE 檔案
