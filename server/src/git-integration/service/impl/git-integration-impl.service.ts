import { Injectable, Inject, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';
import { gitConfig } from '@server/config/git.config';
import { ConfigType } from '@nestjs/config';
import {
  RequestCommitGitDto,
  ResponseCommitGitDto,
} from '@server/git-integration/dto/commit-git.dto';

@Injectable()
export class GitIntegrationServiceImpl {
  private readonly logger = new Logger(GitIntegrationServiceImpl.name);

  public constructor(
    @Inject(gitConfig.KEY)
    private config: ConfigType<typeof gitConfig>,
  ) {}

  public async commitToGit(dto: RequestCommitGitDto) {
    const { task, generatedCode, outputPath, requirementAnalysis } = dto;
    const repoName = this.extractRepoName(task.repository_url);
    if (!repoName) {
      this.logger.error('Invalid repository URL provided');
      throw new Error('Invalid repository URL provided');
    }

    const repoTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `${this.config.templatePath}-${repoName}`),
    );

    try {
      // Initialize Git
      const git = simpleGit();
      // Set up Git configuration
      await git.addConfig('user.name', this.config.gitUsername);
      await git.addConfig('user.email', this.config.gitEmail);
      // Configure SSH if needed (for private repositories)
      const sshKeyPath = this.config.gitSshKeyPath;
      if (sshKeyPath) {
        git.env(
          'GIT_SSH_COMMAND',
          `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`,
        );
      }
      // Clone the repository
      this.logger.log(
        `Cloning repository ${task.repository_url} to ${repoTempDir}`,
      );
      await git.clone(task.repository_url, repoTempDir);
      // Switch to working directory
      const workingGit = simpleGit(repoTempDir);

      // Check out the specified branch
      const branches = await workingGit.branch();

      if (
        branches.all.includes(task.branch) ||
        branches.all.includes(`remotes/origin/${task.branch}`)
      ) {
        await workingGit.checkout(task.branch);
      } else {
        // Create a new branch if it doesn't exist
        await workingGit.checkoutLocalBranch(task.branch);
      }

      // Write files to the repository
      const filesChanged: string[] = [];

      for (const [filePath, content] of Object.entries(generatedCode)) {
        const fullPath = path.join(repoTempDir, outputPath, filePath);

        // Ensure directory exists
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        // Write file content
        fs.writeFileSync(fullPath, content);

        // Add to tracked files
        filesChanged.push(path.join(outputPath, filePath));
      }

      // Stage all changes
      await workingGit.add(filesChanged);
      // Create commit message
      const commitMessage = `feat: implement ${
        requirementAnalysis.title || 'new requirement'
      }\n\n${task.requirement_text.substring(0, 200)}${
        task.requirement_text.length > 200 ? '...' : ''
      }`;

      // Commit changes
      const commitResult = await workingGit.commit(commitMessage);

      // Push changes to remote
      await workingGit.push('origin', task.branch);

      return {
        commitHash: commitResult.commit,
        filesChanged,
      };
    } catch (error) {
      this.logger.error(
        `Error committing to Git: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to commit to Git repository: ${error.message}`);
    } finally {
      // Clean up temporary directory
      try {
        fs.rmSync(repoTempDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${repoTempDir}`);
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to clean up temporary directory: ${cleanupError.message}`,
        );
      }
    }
  }

  private extractRepoName(repositoryUrl: string): string {
    try {
      // Remove protocol and get the path part
      let path = repositoryUrl.replace(/^https?:\/\//, '').replace(/^git@/, '');

      // Handle SSH format (git@host:owner/repo.git)
      if (path.includes(':') && !path.includes('/')) {
        path = path.split(':')[1];
      } else {
        // Handle HTTPS format - get everything after the domain
        path = path.split('/').slice(1).join('/');
      }

      // Remove .git extension
      path = path.replace(/\.git$/, '');

      // Replace all special characters with underscores
      return path.replace(/[^a-zA-Z0-9]/g, '-');
    } catch (error) {
      return;
    }
  }
}
