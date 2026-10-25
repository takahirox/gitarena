import { capture } from './capture.js';
const $ = selector => document.querySelector(selector);
let token, session, feedback = [], loaded = '', draft, tool = 'pen', drawing, busy = false;
const error = message => { $('#error').textContent = message || ''; $('#error').hidden = !message; };
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-GitArena-Token': token || '' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function render() {
  const running = session?.status === 'running';
  $('#empty').hidden = running;
  $('#comparison').hidden = !running;
  $('#stop').disabled = !session || ['stopped', 'failed'].includes(session.status) || busy;
  $('#swap').disabled = !running;
  $('#configure').disabled = busy;
  if (session) {
    $('#status').textContent = ({ starting: 'Preparing two isolated apps… You can stop startup at any time.', running: 'Both versions are live. Interact with either app independently.', stopping: 'Stopping apps and removing worktrees…', stopped: 'Comparison stopped. Saved feedback is still available.', failed: 'Startup or runtime failed. Review the details and choose commits to retry.', 'cleanup-failed': 'Cleanup needs attention. Restore Docker access, then retry Stop.' })[session.status];
    if (session.error) error(session.error);
  }
  const key = running ? `${session.id}:${session.targets.left.url}:${session.targets.right.url}` : '';
  if (key !== loaded) {
    for (const side of ['left', 'right']) {
      const pane = $(`#${side}-pane`), target = session?.targets?.[side];
      pane.querySelector('iframe').src = running ? target.url : 'about:blank';
      pane.querySelector('.ref').textContent = target?.ref || '';
      pane.querySelector('.sha').textContent = target?.sha.slice(0, 10) || '';
      pane.querySelector('.sha').title = target?.sha || '';
    }
    loaded = key;
  }
  $('#feedback-count').textContent = feedback.length;
}
function setup() {
  if (session?.config) for (const [key, value] of Object.entries(session.config)) {
    const input = $('#setup-form').elements.namedItem(key); if (input) input.value = value;
  }
  $('#setup').showModal();
}
$('#configure').onclick = setup;
$('#begin').onclick = setup;
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(`#${button.dataset.close}`).close();
$('#swap').onclick = () => document.body.classList.toggle('swapped');
$('#stop').onclick = async () => {
  busy = true; render(); error('');
  try { session = await api(`/api/sessions/${session.id}`, 'DELETE'); }
  catch (failure) { error(failure.message); }
  finally { busy = false; render(); }
};
$('#setup-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  busy = true; $('#setup-form button[type=submit]').disabled = true; error('');
  try {
    if (session && ['starting', 'running', 'cleanup-failed'].includes(session.status)) {
      session = await api(`/api/sessions/${session.id}`, 'DELETE');
      if (session.status === 'cleanup-failed') throw new Error(session.error);
    }
    session = await api('/api/sessions', 'POST', Object.fromEntries(new FormData(event.target)));
    document.body.classList.remove('swapped');
    $('#setup').close();
  } catch (failure) { $('#setup').close(); error(failure.message); }
  finally { busy = false; $('#setup-form button[type=submit]').disabled = false; render(); }
};

for (const button of document.querySelectorAll('.annotate')) button.onclick = async () => {
  if (busy || session?.status !== 'running') return;
  const id = session.id, side = button.dataset.side;
  button.disabled = true; error('');
  try {
    const snapshot = await capture($(`#${side}-pane iframe`));
    if (session.id !== id || session.status !== 'running') throw new Error('This comparison stopped during capture. Launch it again before annotating.');
    openEditor({ ...snapshot, side, sessionId: id, sourceCommit: session.targets[side].sha, annotations: [], comment: '', context: { targets: session.targets } }, false);
  } catch (failure) { error(failure.message); }
  finally { button.disabled = false; }
};
function openEditor(record, readonly) {
  draft = structuredClone(record); draft.readonly = readonly;
  $('#editor-title').textContent = readonly ? 'Saved feedback' : 'Annotate snapshot';
  const context = record.context.targets;
  $('#source').textContent = `${record.side} · ${record.sourceCommit} · compared with ${context[record.side === 'left' ? 'right' : 'left'].sha.slice(0, 10)}`;
  $('#snapshot-image').src = record.screenshot;
  $('#snapshot-image').width = record.width; $('#snapshot-image').height = record.height;
  $('#comment').value = record.comment; $('#comment').readOnly = readonly;
  $('#tools').hidden = readonly; $('#save').hidden = readonly;
  $('#save-status').textContent = readonly ? `Saved ${new Date(record.createdAt).toLocaleString()}` : 'SNAPSHOT — the live apps are behind this window.';
  $('#drawing').classList.toggle('readonly', readonly);
  $('#mode').textContent = 'SNAPSHOT ANNOTATION';
  drawing = undefined; renderDrawing(); $('#editor').showModal();
}
$('#editor').addEventListener('close', () => { $('#mode').textContent = 'LIVE COMPARISON'; drawing = undefined; });
for (const button of document.querySelectorAll('[data-tool]')) button.onclick = () => {
  tool = button.dataset.tool;
  for (const candidate of document.querySelectorAll('[data-tool]')) candidate.setAttribute('aria-pressed', String(candidate === button));
};
function point(event) {
  const rect = $('#drawing').getBoundingClientRect();
  return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
}
$('#drawing').onpointerdown = event => {
  if (!draft || draft.readonly || event.button !== 0) return;
  event.preventDefault();
  const start = point(event);
  drawing = { tool, points: [start, start] };
  $('#drawing').setPointerCapture(event.pointerId); renderDrawing();
};
$('#drawing').onpointermove = event => {
  if (!drawing) return;
  if (drawing.tool === 'pen' && drawing.points.length < 10000) drawing.points.push(point(event));
  else drawing.points[1] = point(event);
  renderDrawing();
};
$('#drawing').onpointerup = () => {
  if (drawing) { draft.annotations.push(drawing); drawing = undefined; renderDrawing(); }
};
$('#drawing').onpointercancel = () => { drawing = undefined; renderDrawing(); };
$('#undo').onclick = () => { draft.annotations.pop(); renderDrawing(); };
$('#clear').onclick = () => { draft.annotations = []; renderDrawing(); };
function renderDrawing() {
  const svg = $('#drawing'); svg.replaceChildren();
  const element = (name, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.append(node);
  };
  for (const mark of [...draft.annotations, ...(drawing ? [drawing] : [])]) {
    const points = mark.points.map(p => p.map(n => n * 1000));
    const [[x1, y1], [x2, y2]] = points;
    if (mark.tool === 'pen') element('polyline', { points: points.map(p => p.join(',')).join(' ') });
    if (mark.tool === 'region') element('ellipse', { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 });
    if (mark.tool === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1), size = 22;
      element('path', { d: `M ${x1} ${y1} L ${x2} ${y2} M ${x2 - size * Math.cos(angle - .5)} ${y2 - size * Math.sin(angle - .5)} L ${x2} ${y2} L ${x2 - size * Math.cos(angle + .5)} ${y2 - size * Math.sin(angle + .5)}` });
    }
  }
}
$('#save').onclick = async () => {
  if (!draft || draft.readonly) return;
  $('#save').disabled = true;
  try {
    const record = await api(`/api/sessions/${draft.sessionId}/feedback`, 'POST', { ...draft, comment: $('#comment').value });
    feedback = await api('/api/feedback'); render();
    $('#editor').close(); openEditor(record, true);
  } catch (failure) { $('#save-status').textContent = `Save failed: ${failure.message}`; }
  finally { $('#save').disabled = false; }
};
$('#library').onclick = async () => {
  try {
    feedback = await api('/api/feedback'); render();
    const list = $('#feedback-list'); list.replaceChildren();
    if (!feedback.length) list.textContent = 'No feedback yet. Capture either live app to create your first note.';
    for (const record of feedback) {
      const button = document.createElement('button'); button.className = 'feedback-item';
      const title = document.createElement('strong'); title.textContent = record.comment || 'Untitled visual feedback';
      const detail = document.createElement('small'); detail.textContent = `${record.sourceCommit.slice(0, 10)} · ${record.side} · ${new Date(record.createdAt).toLocaleString()}`;
      button.append(title, detail);
      button.onclick = async () => {
        try { const saved = await api(`/api/feedback/${record.id}`); $('#saved').close(); openEditor(saved, true); }
        catch (failure) { $('#saved').close(); error(failure.message); }
      };
      list.append(button);
    }
    $('#saved').showModal();
  } catch (failure) { error(failure.message); }
};
try {
  const initial = await api('/api/bootstrap');
  token = initial.token; session = initial.sessions[0]; feedback = initial.feedback; render();
  let polling = false;
  setInterval(async () => {
    if (!session || polling || busy) return;
    polling = true;
    const id = session.id;
    try { const updated = await api(`/api/sessions/${id}`); if (!busy && session.id === id) { session = updated; render(); } }
    catch (failure) { error(`Connection lost: ${failure.message}. Restart GitArena to recover interrupted sessions.`); }
    finally { polling = false; }
  }, 1000);
} catch (failure) { error(failure.message); }
