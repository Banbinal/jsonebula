/**
 * JSON Editor (V5)
 *
 * CodeMirror-based JSON editor with:
 * - Syntax highlighting
 * - Error display
 * - Auto-format
 * - Debounced updates
 */

import { callsStore } from '../../calls/store.js';

let editor = null;
let containerEl = null;
let statusEl = null;
let titleEl = null;
let formatBtnEl = null;
let copyBtnEl = null;
let deleteBtnEl = null;
let debounceTimer = null;
let callbacks = {};
let isUpdatingFromStore = false;

const DEBOUNCE_MS = 300;

/**
 * Initialize the JSON editor
 * @param {Object} options - Callbacks
 * @param {Function} options.onJsonChange - Called when JSON changes (debounced)
 */
export function initJsonEditor(options = {}) {
  callbacks = options;

  containerEl = document.getElementById('editor-container');
  statusEl = document.getElementById('json-status');
  titleEl = document.getElementById('editor-title');
  formatBtnEl = document.getElementById('btn-format-json');
  copyBtnEl = document.getElementById('btn-copy-json');
  deleteBtnEl = document.getElementById('btn-delete-call');

  if (!containerEl) {
    console.error('Editor container not found');
    return;
  }

  // Check if CodeMirror is loaded
  if (typeof CodeMirror === 'undefined') {
    console.error('CodeMirror not loaded');
    containerEl.innerHTML = '<p style="padding: 16px; color: #f85149;">CodeMirror failed to load</p>';
    return;
  }

  // Initialize CodeMirror
  editor = CodeMirror(containerEl, {
    mode: { name: 'javascript', json: true },
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentWithTabs: false,
    placeholder: 'Paste your JSON here...',
    gutters: ['CodeMirror-lint-markers'],
    lint: {
      getAnnotations: lintJson,
      async: false,
    },
  });

  // Handle changes
  editor.on('change', handleEditorChange);

  // Button handlers
  if (formatBtnEl) {
    formatBtnEl.addEventListener('click', handleFormat);
  }

  if (copyBtnEl) {
    copyBtnEl.addEventListener('click', handleCopy);
  }

  if (deleteBtnEl) {
    deleteBtnEl.addEventListener('click', handleDelete);
  }

  // Listen for store changes
  callsStore.onChange((state, eventType) => {
    if (eventType === 'activeChanged' || eventType === 'init' || eventType === 'callCreated' || eventType === 'callDeleted') {
      loadActiveCall();
    }
  });

  // Initial load
  loadActiveCall();
}

/**
 * Custom JSON linter
 */
function lintJson(text) {
  const errors = [];

  if (!text || text.trim() === '') {
    return errors;
  }

  try {
    JSON.parse(text);
  } catch (e) {
    // Try to extract line number from error
    const match = e.message.match(/position (\d+)/);
    let line = 0;
    let ch = 0;

    if (match) {
      const pos = parseInt(match[1], 10);
      const lines = text.substring(0, pos).split('\n');
      line = lines.length - 1;
      ch = lines[lines.length - 1].length;
    }

    errors.push({
      from: CodeMirror.Pos(line, ch),
      to: CodeMirror.Pos(line, ch + 1),
      message: e.message,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Load active call into editor
 */
function loadActiveCall() {
  const call = callsStore.getActiveCall();

  if (!call) {
    if (editor) {
      isUpdatingFromStore = true;
      editor.setValue('');
      isUpdatingFromStore = false;
    }
    updateStatus(null);
    updateTitle('No call selected');
    return;
  }

  if (editor) {
    isUpdatingFromStore = true;
    editor.setValue(call.json || '');
    isUpdatingFromStore = false;
  }

  updateStatus(call);
  updateTitle(call.name);
}

/**
 * Handle editor content change
 */
function handleEditorChange() {
  if (isUpdatingFromStore) return;

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Debounce updates
  debounceTimer = setTimeout(() => {
    const callId = callsStore.getActiveCallId();
    if (!callId) return;

    const json = editor.getValue();
    callsStore.updateJson(callId, json);

    // Get updated call for status
    const call = callsStore.getCall(callId);
    updateStatus(call);

    if (callbacks.onJsonChange) {
      callbacks.onJsonChange(callId, json, call.parsedJson, call.parseError);
    }
  }, DEBOUNCE_MS);
}

/**
 * Update status indicator
 */
function updateStatus(call) {
  if (!statusEl) return;

  if (!call || !call.json || call.json.trim() === '') {
    statusEl.textContent = '';
    statusEl.className = 'status-indicator';
    return;
  }

  if (call.parseError) {
    statusEl.textContent = 'Invalid JSON';
    statusEl.className = 'status-indicator invalid';
  } else {
    const nodeCount = countNodes(call.parsedJson);
    statusEl.textContent = `Valid (${nodeCount} nodes)`;
    statusEl.className = 'status-indicator valid';
  }
}

/**
 * Update editor title
 */
function updateTitle(name) {
  if (titleEl) {
    titleEl.textContent = name || 'JSON Editor';
  }
}

/**
 * Count nodes in JSON (rough estimate)
 */
function countNodes(data) {
  if (data === null || data === undefined) return 0;

  let count = 0;

  function traverse(value) {
    if (value === null || typeof value !== 'object') return;

    count++;

    if (Array.isArray(value)) {
      value.forEach(traverse);
    } else {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(data);
  return count;
}

/**
 * Handle format button
 */
function handleFormat() {
  if (!editor) return;

  const text = editor.getValue();
  if (!text.trim()) return;

  try {
    const parsed = JSON.parse(text);
    const formatted = JSON.stringify(parsed, null, 2);
    editor.setValue(formatted);
  } catch (e) {
    // Can't format invalid JSON
    console.warn('Cannot format invalid JSON');
  }
}

/**
 * Handle copy button
 */
async function handleCopy() {
  if (!editor) return;

  const text = editor.getValue();

  try {
    await navigator.clipboard.writeText(text);
    if (copyBtnEl) {
      const originalText = copyBtnEl.textContent;
      copyBtnEl.textContent = 'Copied!';
      setTimeout(() => {
        copyBtnEl.textContent = originalText;
      }, 1500);
    }
  } catch (e) {
    console.error('Failed to copy:', e);
  }
}

/**
 * Handle delete call button
 */
function handleDelete() {
  const callId = callsStore.getActiveCallId();
  if (!callId) return;

  const call = callsStore.getCall(callId);
  if (!call) return;

  // Confirm if call has content
  if (call.json && call.json.trim()) {
    if (!confirm(`Delete "${call.name}"? This cannot be undone.`)) {
      return;
    }
  }

  callsStore.deleteCall(callId);

  // Create new call if none left
  if (callsStore.getCallCount() === 0) {
    callsStore.createCall();
  }
}

/**
 * Set editor content programmatically
 */
export function setEditorContent(content) {
  if (editor) {
    isUpdatingFromStore = true;
    editor.setValue(content);
    isUpdatingFromStore = false;
  }
}

/**
 * Get editor content
 */
export function getEditorContent() {
  return editor ? editor.getValue() : '';
}

/**
 * Focus the editor
 */
export function focusEditor() {
  if (editor) {
    editor.focus();
  }
}

/**
 * Refresh editor (call after container resize)
 */
export function refreshEditor() {
  if (editor) {
    editor.refresh();
  }
}
