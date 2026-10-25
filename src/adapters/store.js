import { mkdir, readFile, readdir, rename, writeFile, rm, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export class Store {
  constructor(root) { this.root = root; }
  async init() { for (const dir of ['sessions', 'feedback', 'work']) await mkdir(path.join(this.root, dir), { recursive: true, mode: 0o700 }); }
  file(kind, id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid record ID.');
    return path.join(this.root, kind, `${id}.json`);
  }
  async write(kind, record) {
    const file = this.file(kind, record.id), temporary = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
  }
  async all(kind) {
    return Promise.all((await readdir(path.join(this.root, kind))).filter(n => n.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(this.root, kind, name), 'utf8'))));
  }
  sessions() { return this.all('sessions'); }
  saveSession(record) { return this.write('sessions', record); }
  saveFeedback(record) { return this.write('feedback', record); }
  async feedback(id) { return JSON.parse(await readFile(this.file('feedback', id), 'utf8')); }
  async feedbackList() { return (await this.all('feedback')).map(({ screenshot, annotations, ...record }) => record).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async lock() {
    const file = path.join(this.root, 'server.lock');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(file, 'wx', 0o600);
        await handle.writeFile(String(process.pid)); await handle.close();
        return () => rm(file, { force: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const pid = Number(await readFile(file, 'utf8'));
        if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid data directory lock; inspect server.lock before removing it.');
        try { process.kill(pid, 0); throw new Error('This data directory is already in use by another server.'); }
        catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
        await rm(file);
      }
    }
    throw new Error('Could not lock data directory.');
  }
}
