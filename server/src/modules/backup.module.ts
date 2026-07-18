import {
  BadRequestException,
  Controller,
  Delete,
  Headers,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Res,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs, createReadStream, existsSync, createWriteStream, mkdirSync } from 'fs';
import { exec, spawn } from 'child_process';
import { join, basename } from 'path';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { promisify } from 'util';
import { Roles } from 'src/guards/jwt-auth.guard';
import { backupRoot, assetsRoot } from 'src/shared/projectRoot';

const execAsync = promisify(exec);
const MAX_CHUNK_BYTES = 100 * 1024 * 1024;
const uploadChunkStorage = diskStorage({
  destination: (_req, _file, callback) => {
    const dir = join(backupRoot, '.upload-tmp', 'incoming');
    mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req, _file, callback) => {
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.part`);
  },
});

export class BackupService {
  private get backupDir(): string {
    // Backup directory is always at the same level as the project root
    return backupRoot;
  }

  private get assetsDir(): string {
    return assetsRoot;
  }

  private get mongoUri(): string {
    return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera';
  }

  private get dbName(): string {
    return process.env.DB_NAME || 'forvera';
  }

  private get uploadTempDir(): string {
    return join(this.backupDir, '.upload-tmp');
  }

  private sanitizeBackupName(name: string): string {
    return basename(name || '').replace(/[^\w.\-]/g, '_');
  }

  private sanitizeUploadId(uploadId: string): string {
    return String(uploadId || '').replace(/[^\w.\-]/g, '_');
  }

  async streamFileWithRange(
    res: Response,
    filePath: string,
    fileName: string,
    rangeHeader?: string,
  ) {
    const stat = await fs.stat(filePath);
    const totalSize = stat.size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : totalSize - 1;

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= totalSize) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        return;
      }

      const safeEnd = Math.min(end, totalSize - 1);
      const chunkSize = safeEnd - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      createReadStream(filePath, { start, end: safeEnd }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(totalSize));
    createReadStream(filePath).pipe(res);
  }

  async listBackupFiles(): Promise<{ name: string; path: string; mtimeMs: number; size: number }[]> {
    try {
      const dirents = await fs.readdir(this.backupDir, { withFileTypes: true });
      const files = await Promise.all(
        dirents
          .filter(dirent => dirent.isFile() && dirent.name.endsWith('.zip'))
          .map(async dirent => {
            const filePath = join(this.backupDir, dirent.name);
            const stat = await fs.stat(filePath);
            return { name: dirent.name, path: filePath, mtimeMs: stat.mtimeMs, size: stat.size };
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

  async saveUploadedBackup(file: { originalname?: string; buffer?: Buffer }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('未接收到上传文件');
    }

    const safeName = this.sanitizeBackupName(file.originalname || '');
    if (!safeName || !safeName.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('仅支持上传 .zip 备份文件');
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    const targetPath = join(this.backupDir, safeName);
    await fs.writeFile(targetPath, file.buffer);
    const stat = await fs.stat(targetPath);

    return { name: safeName, path: targetPath, mtimeMs: stat.mtimeMs, size: stat.size };
  }

  async saveUploadedBackupChunk(
    file: { originalname?: string; buffer?: Buffer; path?: string; size?: number },
    payload: { uploadId?: string; chunkIndex?: string; totalChunks?: string; fileName?: string },
  ) {
    if (!file || (!file.buffer && !file.path)) {
      throw new BadRequestException('未接收到上传分片');
    }

    const chunkSize = file.size ?? file.buffer?.length ?? 0;
    if (chunkSize > MAX_CHUNK_BYTES) {
      throw new BadRequestException('单个分片不能超过 100MB');
    }

    const uploadId = this.sanitizeUploadId(payload?.uploadId || '');
    if (!uploadId) {
      throw new BadRequestException('缺少 uploadId');
    }

    const chunkIndex = Number(payload?.chunkIndex);
    const totalChunks = Number(payload?.totalChunks);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new BadRequestException('chunkIndex 非法');
    }
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 100000) {
      throw new BadRequestException('totalChunks 非法');
    }

    const safeName = this.sanitizeBackupName(payload?.fileName || file.originalname || '');
    if (!safeName || !safeName.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('仅支持上传 .zip 备份文件');
    }

    const sessionDir = join(this.uploadTempDir, uploadId);
    const chunkDir = join(sessionDir, 'chunks');
    await fs.mkdir(chunkDir, { recursive: true });

    const chunkName = `${String(chunkIndex).padStart(6, '0')}.part`;
    const chunkPath = join(chunkDir, chunkName);
    if (file.path) {
      await fs.rename(file.path, chunkPath);
    } else {
      await fs.writeFile(chunkPath, file.buffer as Buffer);
    }

    const chunkFiles = (await fs.readdir(chunkDir)).filter((item) => item.endsWith('.part'));
    if (chunkFiles.length < totalChunks) {
      return {
        ok: true,
        completed: false,
        received: chunkIndex + 1,
        totalChunks,
        name: safeName,
      };
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    const targetPath = join(this.backupDir, safeName);
    const tempPath = join(sessionDir, `${safeName}.assembling`);
    const out = createWriteStream(tempPath);

    try {
      for (let index = 0; index < totalChunks; index += 1) {
        const partPath = join(chunkDir, `${String(index).padStart(6, '0')}.part`);
        await new Promise<void>((resolve, reject) => {
          const input = createReadStream(partPath);
          input.once('error', reject);
          out.once('error', reject);
          input.once('end', resolve);
          input.pipe(out, { end: false });
        });
      }

      await new Promise<void>((resolve, reject) => {
        out.once('finish', resolve);
        out.once('error', reject);
        out.end();
      });

      await fs.rename(tempPath, targetPath);
      await fs.rm(sessionDir, { recursive: true, force: true });

      const stat = await fs.stat(targetPath);
      return {
        ok: true,
        completed: true,
        name: safeName,
        path: targetPath,
        size: stat.size,
      };
    } catch (error) {
      try {
        out.destroy();
      } catch {
        // ignore
      }
      throw error;
    }
  }

  async triggerBackup() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const workDir = join(this.backupDir, `forvera-backup-${dateTag}`);
      const zipPath = `${workDir}.zip`;

      // Create working directory
      await fs.mkdir(workDir, { recursive: true });

      // 1) Backup assets if they exist
      if (existsSync(this.assetsDir)) {
        const assetsTarget = join(workDir, 'assets');
        await fs.mkdir(assetsTarget, { recursive: true });
        await execAsync(`cp -a "${this.assetsDir}/." "${assetsTarget}/"`);
      }

      // 2) Backup MongoDB
      const mongoTarget = join(workDir, 'mongodb');
      await fs.mkdir(mongoTarget, { recursive: true });
      
      try {
        await execAsync(`mongodump --uri="${this.mongoUri}" --db="${this.dbName}" --out="${mongoTarget}"`, {
          maxBuffer: 50 * 1024 * 1024,
        });
      } catch (error: any) {
        throw new Error(`MongoDB dump failed: ${error.message}`);
      }

      // 3) Create zip archive
      await execAsync(`cd "${this.backupDir}" && zip -rq "${zipPath}" "forvera-backup-${dateTag}"`);

      // 4) Clean up temporary directory
      await fs.rm(workDir, { recursive: true, force: true });

      const latest = await this.getLatestBackupInfo();
      return {
        ok: true,
        latest,
      };
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: '触发备份失败',
        error: error?.message || String(error),
      });
    }
  }

  async restoreBackup(name: string) {
    const files = await this.listBackupFiles();
    const backup = files.find(file => file.name === name);
    if (!backup) {
      throw new NotFoundException('找不到指定备份文件');
    }

    try {
      const tmpDir = join(this.backupDir, `restore-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      // 1) Unzip backup
      await execAsync(`unzip -q "${backup.path}" -d "${tmpDir}"`);

      // Find the extracted directory (should be forvera-backup-*)
      const dirents = await fs.readdir(tmpDir, { withFileTypes: true });
      const extractedDir = dirents.find(d => d.isDirectory() && d.name.startsWith('forvera-backup-'));
      if (!extractedDir) {
        throw new Error('Backup archive does not contain expected directory structure');
      }

      const backupContent = join(tmpDir, extractedDir.name);

      // 2) Drop existing database collections (clear current data)
      try {
        await execAsync(`mongosh "${this.mongoUri}" --quiet --eval "db.dropDatabase()"`);
      } catch (error) {
        // If mongosh fails, try with mongo (older version)
        try {
          await execAsync(`mongo "${this.mongoUri}" --quiet --eval "db.dropDatabase()"`);
        } catch (innerError: any) {
          throw new Error(`Failed to drop database: ${innerError.message}`);
        }
      }

      // 3) Restore MongoDB from backup
      const mongoBackup = join(backupContent, 'mongodb', this.dbName);
      if (existsSync(mongoBackup)) {
        await execAsync(`mongorestore --uri="${this.mongoUri}" --db="${this.dbName}" --drop "${mongoBackup}"`, {
          maxBuffer: 50 * 1024 * 1024,
        });
      }

      // 4) Restore assets (clear and replace)
      const assetsBackup = join(backupContent, 'assets');
      if (existsSync(assetsBackup)) {
        // Remove old assets
        if (existsSync(this.assetsDir)) {
          await fs.rm(this.assetsDir, { recursive: true, force: true });
        }
        // Create fresh assets directory
        await fs.mkdir(this.assetsDir, { recursive: true });
        // Copy backup assets
        await execAsync(`cp -a "${assetsBackup}/." "${this.assetsDir}/"`);
      }

      // 5) Clean up temporary directory
      await fs.rm(tmpDir, { recursive: true, force: true });

      return {
        ok: true,
        message: '备份恢复成功',
      };
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: '恢复备份失败',
        error: error?.message || String(error),
      });
    }
  }
}

@Controller('api/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Roles(3)
  @Get('list')
  async listBackups() {
    const files = await this.backupService.listBackupFiles()
    return files.map(file => ({
      name: file.name,
      path: file.path,
      mtimeMs: file.mtimeMs,
      size: file.size,
    }))
  }

  @Roles(3)
  @Get('latest')
  async downloadLatest(@Res() res: Response, @Headers('range') range?: string) {
    const latest = await this.backupService.getLatestBackup();
    await this.backupService.streamFileWithRange(res, latest.path, latest.name, range);
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
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBackup(@UploadedFile() file) {
    return await this.backupService.saveUploadedBackup(file);
  }

  @Roles(3)
  @Post('upload/chunk')
  @UseInterceptors(FileInterceptor('chunk', { storage: uploadChunkStorage, limits: { fileSize: MAX_CHUNK_BYTES } }))
  async uploadBackupChunk(@UploadedFile() chunk: any, @Body() body: any) {
    return await this.backupService.saveUploadedBackupChunk(chunk, body);
  }

  @Roles(3)
  @Delete('cleanup')
  async cleanupOld() {
    return await this.backupService.cleanupOldBackups();
  }

  @Roles(3)
  @Get(':name')
  async downloadBackup(@Res() res: Response, @Param('name') name: string, @Headers('range') range?: string) {
    const files = await this.backupService.listBackupFiles()
    const backup = files.find(file => file.name === name)
    if (!backup) {
      throw new NotFoundException('找不到指定备份文件')
    }
    await this.backupService.streamFileWithRange(res, backup.path, backup.name, range)
  }

  @Roles(3)
  @Delete(':name')
  async deleteBackup(@Param('name') name: string) {
    const files = await this.backupService.listBackupFiles()
    const backup = files.find(file => file.name === name)
    if (!backup) {
      throw new NotFoundException('找不到指定备份文件')
    }
    await fs.rm(backup.path, { force: true })
    return { deleted: backup.name }
  }

  @Roles(3)
  @Post('restore/:name')
  async restoreBackup(@Param('name') name: string) {
    return await this.backupService.restoreBackup(name);
  }

}

@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
