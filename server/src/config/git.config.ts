import { registerAs } from '@nestjs/config';

export type GitConfig = {
  gitUsername: string;
  gitEmail: string;
  gitSshKeyPath: string;
  templatePath: string;
};

export const gitConfig = registerAs<GitConfig>('git', () => ({
  gitUsername: process.env.GIT_USERNAME,
  gitEmail: process.env.GIT_EMAIL,
  gitSshKeyPath: process.env.GIT_SSH_KEY_PATH,
  templatePath: process.env.GIT_TEMPLATE_PATH,
}));
