import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function command(file, args, options = {}) {
  const { includeStderr = false, ...executionOptions } = options;
  try {
    const result = await execute(file, args, { timeout: 30000, maxBuffer: 1024 * 1024, ...executionOptions });
    return (result.stdout + (includeStderr ? result.stderr : '')).trim();
  }
  catch (error) {
    const detail = String(error.stderr || error.message).slice(-5000);
    throw new Error(`${file} failed: ${detail}`, { cause: error });
  }
}
