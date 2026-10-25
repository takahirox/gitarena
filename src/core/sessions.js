import { configuration, validateFeedback } from './validation.js';

// Ports: repository.prepare/remove, web.start/stop/healthy, store's durable records.
// The core never receives an iframe, DOM node, or browser capture implementation.
export class Sessions {
  constructor({ repository, web, store, newId, now = () => new Date().toISOString() }) {
    Object.assign(this, { repository, web, store, newId, now });
    this.records = new Map();
    this.jobs = new Map();
    this.controllers = new Map();
  }

  async recover() {
    for (const record of await this.store.sessions()) {
      this.records.set(record.id, record);
      if (['starting', 'running', 'stopping', 'cleanup-failed'].includes(record.status)) {
        await this.cleanup(record);
        record.status = 'stopped';
        record.error = 'Recovered an interrupted session; launch again to compare.';
        await this.save(record);
      }
    }
  }

  async save(record) { await this.store.saveSession(record); return record; }
  get(id) { const record = this.records.get(id); if (!record) throw new Error('Comparison not found.'); return record; }
  list() { return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

  async create(input) {
    if (this.closing) throw new Error('GitArena is shutting down.');
    if (this.creating || this.list().some(s => ['starting', 'running', 'stopping', 'cleanup-failed'].includes(s.status))) throw new Error('Stop the current comparison before launching another.');
    const config = configuration(input);
    this.creating = true;
    let finished;
    this.createCompletion = new Promise(resolve => { finished = resolve; });
    try {
      const record = { id: this.newId(), createdAt: this.now(), status: 'starting', config };
      await this.save(record);
      this.records.set(record.id, record);
      const controller = new AbortController();
      this.controllers.set(record.id, controller);
      const job = this.launch(record, controller.signal).finally(() => { this.jobs.delete(record.id); this.controllers.delete(record.id); });
      this.jobs.set(record.id, job);
      return record;
    } finally { this.creating = false; finished(); }
  }

  async launch(record, signal) {
    try {
      const prepared = await this.repository.prepare(record.id, record.config, signal);
      Object.assign(record, prepared);
      await this.save(record);
      signal.throwIfAborted();
      const starts = ['left', 'right'].map(async side => {
        try {
          const launched = await this.web.start(record, side, signal);
          Object.assign(record.targets[side], launched);
        } catch (error) { this.controllers.get(record.id)?.abort(error); throw error; }
      });
      const results = await Promise.allSettled(starts);
      const failure = results.find(r => r.status === 'rejected');
      if (failure) throw signal.reason || failure.reason;
      signal.throwIfAborted();
      record.status = 'running';
      await this.save(record);
    } catch (error) {
      record.error = String(error.message || error).slice(0, 8000);
      try { await this.cleanup(record); record.status = signal.aborted && record.status === 'stopping' ? 'stopped' : 'failed'; }
      catch (cleanupError) { record.status = 'cleanup-failed'; record.error += `\nCleanup failed: ${cleanupError.message}. Retry Stop before launching again.`; }
      await this.save(record);
    }
  }

  async cleanup(record) {
    // Never remove a worktree while its container may still be using it.
    await this.web.stop(record.id);
    await this.repository.remove(record.id);
  }

  async stop(id) {
    const record = this.get(id);
    record.status = 'stopping';
    await this.save(record);
    this.controllers.get(id)?.abort(new Error('Startup cancelled.'));
    await this.jobs.get(id);
    try { await this.cleanup(record); record.status = 'stopped'; }
    catch (error) { record.status = 'cleanup-failed'; record.error = error.message; }
    return this.save(record);
  }

  async check() {
    for (const record of this.list().filter(r => r.status === 'running')) {
      let runtimeError;
      try {
        if (!await this.web.healthy(record)) runtimeError = 'An application exited. Check your start command and memory requirements, then relaunch.';
      } catch (error) { runtimeError = `Runtime check failed: ${error.message}`; }
      if (!runtimeError || record.status !== 'running') continue;
      record.error = runtimeError;
      try {
        await this.cleanup(record);
        if (record.status === 'running') record.status = 'failed';
      } catch (error) {
        if (record.status === 'running') { record.status = 'cleanup-failed'; record.error += `\nCleanup failed: ${error.message}. Retry Stop.`; }
      }
      await this.save(record);
    }
  }

  async feedback(id, input) {
    const data = validateFeedback(input, this.get(id));
    const record = { ...data, id: this.newId(), createdAt: this.now() };
    await this.store.saveFeedback(record);
    return record;
  }

  async close() {
    this.closing = true;
    await this.createCompletion;
    const stopped = await Promise.all(this.list().filter(r => ['starting', 'running', 'stopping', 'cleanup-failed'].includes(r.status)).map(r => this.stop(r.id)));
    const failed = stopped.find(record => record.status === 'cleanup-failed');
    if (failed) throw new Error(`Shutdown cleanup failed: ${failed.error}. Restore Docker access and restart with the same data directory.`);
  }
}
