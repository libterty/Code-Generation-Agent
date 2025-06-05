import { ConfigError } from '@server/core/error';
import { object, string } from 'yup';

export function configValidator(config: Record<string, unknown>) {
  const schema = object({
    NODE_ENV: string().oneOf(['development', 'production']),
    DATABASE_URL: string().required(),
    AUTH_SECRET: string().required(),
    AUTH_AES_IV: string().required(),
    AUTH_AES_KEY: string().required(),
    LLM_API_URL: string().required(),
    LLM_API_KEY: string().required(),
    LLM_API_MODEL: string().default('gpt-4'),
    GIT_USERNAME: string().required(),
    GIT_EMAIL: string().required(),
    GIT_SSH_KEY_PATH: string().required(),
    GIT_TEMPLATE_PATH: string().required(),
    REDIS_HOST: string().required(),
    REDIS_PORT: string().default('6379'),
    REDIS_PASSWORD: string().optional(),
    REDIS_DB: string().default('0'),
    RABBITMQ_URI: string().required(),
    MAX_CONCURRENT_TASKS: string().default('10'),
    OPENAI_MODEL: string().default('gpt-4'),
  });

  // Nest requires synchronous validate function.
  try {
    schema.validateSync(config);
  } catch (err) {
    throw new ConfigError(err.message);
  }

  return config;
}
