# Code Generation Agent

## Project Overview

Code Generation Agent is an intelligent code generation system developed based on the NestJS framework. It can receive natural language requirements, convert them into code through NLP and structured analysis, and automatically perform Git operations.

This project implements the core features of phase one:
1. Requirement parsing and understanding (NLP + structured analysis)
2. Code generation (supports multiple languages)
3. Git automation (commit & push)

## System Architecture

The project adopts a modular design and mainly includes the following core modules:

1. **Requirement Analysis Module**: Responsible for receiving natural language requirements, using LLM for parsing, and converting them into structured data.
2. **Code Generation Module**: Based on the analysis results, generates multi-language code using templates and dynamic generation.
3. **Git Automation Module**: Handles Git operations for code, including commit and push.

## Tech Stack

- **Backend Framework**: NestJS
- **Language**: TypeScript
- **LLM Integration**: OpenAI API
- **Git Integration**: Local Git operations + GitHub API
- **Data Storage**: Reserved interfaces for PostgreSQL and Redis integration

## Installation & Setup

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Git

### Installation Steps

1. Clone the project:
```bash
git clone <repository-url>
cd code-generation-agent
```

2. Install dependencies:
```bash
npm install
```

3. Set environment variables:
Create a `.env` file and set the following variables:
```
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
GITHUB_TOKEN=your_github_token
GITHUB_USERNAME=your_github_username
GITHUB_EMAIL=your_github_email
```

4. Start the application:
```bash
npm run start:dev
```

## API Usage

### 1. Requirement Analysis API

**Endpoint**: `POST /requirement-analysis/analyze`

**Request Format**:
```json
{
  "requirement": "Develop a user management system with user registration, login, and profile management features"
}
```

**Response Format**:
```json
{
  "features": [
    {
      "name": "User Registration",
      "description": "Allows new users to create accounts",
      "priority": "high"
    },
    {
      "name": "User Login",
      "description": "Authenticate user identity",
      "priority": "high"
    },
    {
      "name": "Profile Management",
      "description": "Allows users to view and update their profiles",
      "priority": "medium"
    }
  ],
  "entities": [
    {
      "name": "User",
      "attributes": ["id", "username", "email", "password", "profile"],
      "relationships": []
    }
  ],
  "constraints": [
    {
      "type": "security",
      "description": "Passwords must be stored encrypted"
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

### 2. Code Generation API

**Endpoint**: `POST /code-generation/generate`

**Request Format**:
```json
{
  "projectName": "user-management-system",
  "analysisResult": {
    // Requirement analysis result (from previous step)
  },
  "languages": ["typescript"],
  "outputDir": "/path/to/output"
}
```

**Response Format**:
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

### 3. Git Operation API

**Endpoint**: `POST /git-integration/commit-and-push`

**Request Format**:
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

**Response Format**:
```json
{
  "commitHash": "abc123def456..."
}
```

### 4. Full Process API

**Endpoint**: `POST /process-requirement`

**Request Format**:
```json
{
  "requirement": "Develop a user management system with user registration, login, and profile management features",
  "projectName": "user-management-system",
  "languages": ["typescript"],
  "commitMessage": "Initial commit: User management system"
}
```

**Response Format**:
```json
{
  "analysisResult": {
    // Requirement analysis result
  },
  "generatedCode": [
    // Generated code
  ],
  "success": true
}
```

## Extension Guide

### Add Support for New Programming Languages

1. Create a new generator class in the `src/modules/code-generation/generators/` directory implementing the `ICodeGenerator` interface.
2. Create corresponding template classes in the `src/modules/code-generation/templates/` directory.
3. Register the new generator in the `CodeGenerationModule`.

### Integrate Other Git Providers

1. Create a new provider class in the `src/modules/git-integration/providers/` directory implementing the `IGitProvider` interface.
2. Register the new provider in the `GitIntegrationModule`.

## Testing

Run unit tests:
```bash
npm run test
```

Run end-to-end tests:
```bash
npm run test:e2e
```

## Project Structure

```
code-generation-agent/
├── src/
│   ├── main.ts                        # Application entry point
│   ├── app.module.ts                  # Root module
│   ├── app.controller.ts              # Root controller
│   ├── app.service.ts                 # Root service
│   ├── modules/
│   │   ├── requirement-analysis/      # Requirement analysis module
│   │   ├── requirement-analysis/      # Requirement scheduling
│   │   ├── code-generation/           # Code generation module
│   │   └── git-integration/           # Git automation module
│   │   └── quality-check/             # Code quality assurance module
├── test/                              # Test directory
├── nest-cli.json                      # NestJS CLI config
├── package.json                       # Project dependencies
└── README.md                          # Project documentation
```

## Future Extensions

1. **Database Integration**: Implement PostgreSQL connection for persisting requirements and generation history.
2. **Caching Mechanism**: Integrate Redis for session management and temporary data storage.
3. **More Language Support**: Extend code generators to support more programming languages.
4. **CI/CD Integration**: Automate testing and deployment processes.
5. **User Interface**: Develop a frontend interface for a more user-friendly experience.

## Troubleshooting

1. **LLM API Errors**: Ensure the OPENAI_API_KEY environment variable is set correctly.
2. **Git Operation Failures**: Ensure local Git is properly configured and has the necessary permissions.
3. **GitHub API Errors**: Ensure GITHUB_TOKEN is valid and has sufficient permissions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

