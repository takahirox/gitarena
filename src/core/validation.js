export function configuration(input) {
  if (!input || typeof input !== 'object') throw new Error('Provide a repository, two refs, and launch configuration.');
  const string = (key, fallback, max = 2000) => {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) {
      throw new Error(`Invalid ${key}.`);
    }
    return value.trim();
  };
  const integer = (key, fallback, min, max) => {
    const value = Number(input[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}: use ${min}–${max}.`);
    return value;
  };
  const result = {
    repository: string('repository', undefined, 4096),
    leftRef: string('leftRef', 'HEAD~1', 256), rightRef: string('rightRef', 'HEAD', 256),
    image: string('image', 'node:22-bookworm-slim', 256),
    install: string('install', 'npm ci'), start: string('start', 'npm start'),
    port: integer('port', 3000, 1024, 65535),
    leftPort: integer('leftPort', 0, 0, 65535), rightPort: integer('rightPort', 0, 0, 65535),
    timeout: integer('timeout', 120, 5, 600), readyPath: string('readyPath', '/', 512),
  };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(result.image)) throw new Error('Invalid container image.');
  if (!result.readyPath.startsWith('/') || result.readyPath.startsWith('//') || /[\r\n\\]/.test(result.readyPath)) throw new Error('Readiness path must be a local path starting with /.');
  for (const key of ['leftPort', 'rightPort']) if (result[key] && result[key] < 1024) throw new Error('Host ports must be 0 (automatic) or at least 1024.');
  if (result.leftPort && result.leftPort === result.rightPort) throw new Error('Choose different host ports.');
  return result;
}

export function validateFeedback(input, session) {
  if (!session?.targets || !['left', 'right'].includes(input?.side)) throw new Error('Choose a comparison target.');
  const target = session.targets[input.side];
  const { screenshot, width, height, annotations, comment } = input;
  if (typeof screenshot !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(screenshot) || screenshot.length > 12_000_000) throw new Error('Provide a PNG screenshot under 9 MB.');
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)) throw new Error('Invalid screenshot dimensions.');
  let bytes;
  try { bytes = Uint8Array.from(atob(screenshot.slice(screenshot.indexOf(',') + 1)), c => c.charCodeAt(0)); }
  catch { throw new Error('Invalid PNG encoding.'); }
  const header = new DataView(bytes.buffer);
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
    header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452 || header.getUint32(16) !== width || header.getUint32(20) !== height) {
    throw new Error('PNG header does not match screenshot dimensions.');
  }
  if (typeof comment !== 'string' || comment.length > 10000) throw new Error('Comment must be at most 10,000 characters.');
  if (!Array.isArray(annotations) || annotations.length > 500) throw new Error('Too many annotations.');
  for (const mark of annotations) {
    if (!mark || !['pen', 'region', 'arrow'].includes(mark.tool) || !Array.isArray(mark.points) || mark.points.length < 2 || mark.points.length > 10000 ||
      (mark.tool !== 'pen' && mark.points.length !== 2) || !mark.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1))) {
      throw new Error('Invalid annotation geometry. Use normalized coordinates.');
    }
  }
  return {
    side: input.side, sourceCommit: target.sha, screenshot, width, height,
    annotations: annotations.map(({ tool, points }) => ({ tool, points })), comment,
    context: { sessionId: session.id, repository: session.repository, targets: session.targets },
  };
}
