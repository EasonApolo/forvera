import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('src/guards/jwt-auth.guard', () => ({
  Roles: () => () => ({}),
}), { virtual: true })

import { BackupService } from './backup.module'

describe('BackupService', () => {
  it('lists backup zip files sorted by modification time descending', async () => {
    const tempRoot = await fs.mkdtemp(join(tmpdir(), 'backup-service-'))
    const backupDir = join(tempRoot, 'backup')
    const scriptDir = join(tempRoot, 'scripts')
    await fs.mkdir(backupDir, { recursive: true })
    await fs.mkdir(scriptDir, { recursive: true })
    await fs.writeFile(join(scriptDir, 'backup-monthly.sh'), '#!/usr/bin/env bash\n', { mode: 0o755 })

    const oldFile = join(backupDir, 'old.zip')
    const newFile = join(backupDir, 'new.zip')
    const normalizedTempRoot = tempRoot.replace(/^\/var\//, '/private/var/')
    await fs.writeFile(oldFile, 'old')
    await fs.writeFile(newFile, 'new')
    await fs.utimes(oldFile, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'))
    await fs.utimes(newFile, new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'))

    const service = new BackupService()
    const originalCwd = process.cwd()
    process.chdir(tempRoot)

    try {
      const result = await service.listBackupFiles()
      expect(result).toEqual([
        { name: 'new.zip', path: newFile.replace('/var/', '/private/var/'), mtimeMs: expect.any(Number) },
        { name: 'old.zip', path: oldFile.replace('/var/', '/private/var/'), mtimeMs: expect.any(Number) },
      ])
    } finally {
      process.chdir(originalCwd)
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})
