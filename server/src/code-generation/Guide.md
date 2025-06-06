# Guide for Using Ollama Models in Code Generation

This guide explains how to use the different Ollama models available in the system for code generation and requirement analysis.

## Available Ollama Models

The system supports several Ollama models:

1. **Kevin** (`OLLAMA_KEVIN`) - A versatile model good for general code generation
2. **DeepSeek Coder** (`OLLAMA_DEEPSEEK_CODER`) - Specialized in code generation across multiple languages
3. **DeepSeek Chat** (`OLLAMA_DEEPSEEK_CHAT`) - Better for requirement analysis and understanding
4. **DeepSeek R1** (`OLLAMA_DEEPSEEK_R1`) - Advanced reasoning capabilities
5. **Llama 3** (`OLLAMA_LLAMA3_1`) - General purpose large language model
6. **Qwen 2.5** (`OLLAMA_QWEN2_5`) - Alternative model with different strengths

## Functions for Using Ollama Models

### 1. Checking Ollama Availability

Before using any Ollama models, check if Ollama is available on the system:

```typescript
const ollamaStatus = await llmIntegrationService.checkOllamaAvailability();

if (ollamaStatus.available) {
  console.log(`Ollama is available with models: ${ollamaStatus.models.join(', ')}`);
  // Proceed with using Ollama
} else {
  console.log('Ollama is not available, falling back to default LLM');
  // Use fallback methods
}
```

### 2. Testing Specific Models

To check if a specific model is available:

```typescript
const isKevinAvailable = await llmIntegrationService.testSpecificOllamaModel({
  modelName: 'kevin',
  systemMessage: 'You are a helpful assistant specialized in software development.'
});

if (isKevinAvailable) {
  console.log('Kevin model is available for use');
} else {
  console.log('Kevin model is not available');
}
```

### 3. Analyzing Requirements with Ollama

For requirement analysis, the DeepSeek Chat model is recommended:

```typescript
const requirementAnalysis = await llmIntegrationService.analyzeRequirementWithOllama({
  requirementContext: 'Create a user authentication system with login, registration, and password reset functionality.',
  language: CodeLanguage.typescript,
  systemMessage: 'You are a helpful assistant specialized in software development.'
});

console.log(`Requirement title: ${requirementAnalysis.title}`);
console.log(`Functionality: ${requirementAnalysis.functionality}`);
console.log(`Components: ${requirementAnalysis.components.join(', ')}`);
```

### 4. Generating Code with a Specific Model

To generate code using a specific Ollama model:

```typescript
const generatedCode = await llmIntegrationService.generateCodeWithOllamaModel({
  requirementAnalysis,
  language: CodeLanguage.typescript,
  languageContext: 'Use TypeScript best practices, interfaces, and proper error handling.',
  systemMessage: 'You are a helpful assistant specialized in software development.',
  provider: LLMProvider.OLLAMA_DEEPSEEK_CODER,
  temperature: 0.2
});

// generatedCode is a Record<string, string> where keys are file paths and values are file contents
```

### 5. Using the Kevin Model for Code Generation

Kevin is a versatile model that can be used for specific prompts:

```typescript
const kevinResponse = await llmIntegrationService.generateWithKevinModel({
  prompt: `Generate code in TypeScript for: ${requirementAnalysis.title}\n` +
          `Functionality: ${requirementAnalysis.functionality}\n` +
          `Components: ${requirementAnalysis.components.join(', ')}`,
  systemMessage: 'You are a helpful assistant specialized in software development.'
});

// Parse the response into a code structure
const generatedCode = extractJsonFromText(kevinResponse);
```

### 6. Comparing Multiple Models

For important tasks, you can generate code with multiple models and compare results:

```typescript
const multiModelResults = await llmIntegrationService.generateCodeWithMultipleOllamaModels({
  requirementAnalysis,
  language: CodeLanguage.typescript,
  languageContext: 'Use TypeScript best practices and proper error handling.',
  systemMessage: 'You are a helpful assistant specialized in software development.'
});

// Select the best result based on your criteria
for (const [model, codeFiles] of Object.entries(multiModelResults)) {
  console.log(`Model ${model} generated ${Object.keys(codeFiles).length} files`);
}
```

## Example Usage Scenarios

### Basic Requirement Processing

```typescript
async function processRequirement(requirementText: string, language: CodeLanguage) {
  // Check Ollama availability
  const ollamaStatus = await llmIntegrationService.checkOllamaAvailability();
  
  // Analyze requirement
  let requirementAnalysis;
  if (ollamaStatus.available) {
    requirementAnalysis = await llmIntegrationService.analyzeRequirementWithOllama({
      requirementContext: requirementText,
      language,
      systemMessage: 'You are a helpful assistant specialized in software development.'
    });
  } else {
    // Fallback to non-Ollama analysis
    // ...
  }
  
  // Generate code
  let generatedCode;
  if (ollamaStatus.available) {
    // Try Kevin first, then fall back to DeepSeek Coder
    const isKevinAvailable = await llmIntegrationService.testSpecificOllamaModel({
      modelName: 'kevin',
      systemMessage: 'You are a helpful assistant specialized in software development.'
    });
    
    if (isKevinAvailable) {
      const kevinResponse = await llmIntegrationService.generateWithKevinModel({
        prompt: `Generate ${language} code for: ${requirementAnalysis.title}`,
        systemMessage: 'You are a helpful assistant specialized in software development.'
      });
      generatedCode = extractJsonFromText(kevinResponse);
    } else {
      generatedCode = await llmIntegrationService.generateCodeWithOllamaModel({
        requirementAnalysis,
        language,
        languageContext: getLanguageContext(language),
        systemMessage: 'You are a helpful assistant specialized in software development.',
        provider: LLMProvider.OLLAMA_DEEPSEEK_CODER,
        temperature: 0.2
      });
    }
  } else {
    // Fallback to non-Ollama code generation
    // ...
  }
  
  return { requirementAnalysis, generatedCode };
}
```

### Advanced Model Comparison

```typescript
async function compareModelOutputs(requirementText: string, language: CodeLanguage) {
  // Analyze requirement
  const requirementAnalysis = await llmIntegrationService.analyzeRequirementWithOllama({
    requirementContext: requirementText,
    language,
    systemMessage: 'You are a helpful assistant specialized in software development.'
  });
  
  // Generate code with multiple models
  const multiModelResults = await llmIntegrationService.generateCodeWithMultipleOllamaModels({
    requirementAnalysis,
    language,
    languageContext: getLanguageContext(language),
    systemMessage: 'You are a helpful assistant specialized in software development.'
  });
  
  // Evaluate results and return comparison
  const comparison = [];
  
  for (const [model, codeFiles] of Object.entries(multiModelResults)) {
    const fileCount = Object.keys(codeFiles).length;
    const totalCodeLength = Object.values(codeFiles).reduce((sum, code) => sum + code.length, 0);
    
    comparison.push({
      model,
      fileCount,
      totalCodeLength,
      files: Object.keys(codeFiles)
    });
  }
  
  return {
    requirementAnalysis,
    modelComparison: comparison
  };
}
```

## Best Practices

1. **Always check availability first**: Use `checkOllamaAvailability()` before trying to use any Ollama models.

2. **Have fallbacks ready**: Prepare fallback options for when Ollama or specific models are not available.

3. **Choose the right model for the task**:
   - Use `OLLAMA_DEEPSEEK_CHAT` for requirement analysis
   - Use `OLLAMA_KEVIN` or `OLLAMA_DEEPSEEK_CODER` for code generation
   - Use `OLLAMA_DEEPSEEK_R1` for complex reasoning tasks

4. **Compare model outputs for critical tasks**: For important requirements, generate code with multiple models and compare.

5. **Verify code quality**: Always validate the generated code's quality, regardless of which model was used.

6. **Monitor performance**: Keep track of which models perform best for different types of requirements and languages.