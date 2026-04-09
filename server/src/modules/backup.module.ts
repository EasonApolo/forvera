import {
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Res,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { promises as fs, createReadStream } from 'fs';
import { execFile } from 'child_process';
import { join } from 'path';
import { Response } from 'express';
import { promisify } from 'util';
import { Roles } from 'src/guards/jwt-auth.guard';

const execFileAsync = promisify(execFile);

class BackupService {
  private get projectRoot(): string {
    return join(process.cwd(), '..');
  }

  private get backupDir(): string {
    return join(this.projectRoot, '..', 'backup');
  }

  private get backupScriptPath(): string {
    return join(this.projectRoot, 'backup-monthly.sh');
  }

  async listBackupFiles(): Promise<{ name: string; path: string; mtimeMs: number }[]> {
    try {
      const dirents = await fs.readdir(this.backupDir, { withFileTypes: true });
      const files = await Promise.all(
        dirents
          .filter(dirent => dirent.isFile() && dirent.name.endsWith('.zip'))
          .map(async dirent => {
            const filePath = join(this.backupDir, dirent.name);
            const stat = await fs.stat(filePath);
            return { name: dirent.name, path: filePath, mtimeMs: stat.mtimeMs };
          }),
      );

      return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch {
      return [];
    }
  }

  async getLatestBackup() {
    const files = await this.listBackupFiles();
    if (!files.length) {
      throw new NotFoundException('没有可下载的备份文件');
    }
    return files[0];
  }

  async getLatestBackupInfo() {
    const files = await this.listBackupFiles();
    if (!files.length) {
      return {
        exists: false,
        name: null,
        updatedAt: null,
      };
    }

    const latest = files[0];
    return {
      exists: true,
      name: latest.name,
      updatedAt: new Date(latest.mtimeMs).toISOString(),
    };
  }

  async cleanupOldBackups() {
    const files = await this.listBackupFiles();
    if (!files.length) {
      return { kept: null, deleted: [] as string[] };
    }

    const [latest, ...oldFiles] = files;
    await Promise.all(oldFiles.map(file => fs.rm(file.path, { force: true })));

    return {
      kept: latest.name,
      deleted: oldFiles.map(file => file.name),
    };
  }

  async triggerBackup() {
    try {
      await fs.access(this.backupScriptPath);
    } catch {
      throw new NotFoundException('未找到备份脚本 backup-monthly.sh');
    }

    try {
      const { stdout, stderr } = await execFileAsync('bash', [this.backupScriptPath], {
        cwd: this.projectRoot,
        maxBuffer: 10 * 1024 * 1024,
      });

      const latest = await this.getLatestBackupInfo();
      return {
        ok: true,
        latest,
        stdout,
        stderr,
      };
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: '触发备份失败',
        stderr: error?.stderr || '',
        stdout: error?.stdout || '',
      });
    }
  }
}

@Controller('api/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Roles(3)
  @Get('latest')
  async downloadLatest(@Res() res: Response) {
    const latest = await this.backupService.getLatestBackup();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(latest.name)}"`);
    const stream = createReadStream(latest.path);
    stream.pipe(res);
  }

  @Roles(3)
  @Get('latest-info')
  async latestInfo() {
    return await this.backupService.getLatestBackupInfo();
  }

  @Roles(3)
  @Post('trigger')
  async trigger() {
    return await this.backupService.triggerBackup();
  }

  @Roles(3)
  @Delete('cleanup')
  async cleanupOld() {
    return await this.backupService.cleanupOldBackups();
  }
}

@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
