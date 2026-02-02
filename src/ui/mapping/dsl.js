/**
 * Config Output Panel V4
 *
 * Displays the JSON configuration in real-time with copy functionality.
 */

import { configStore } from '../../config/store.js';

let outputEl = null;
let copyBtn = null;

/**
 * Initialize the config output panel
 */
export function initConfigOutput() {
  // Try V4 element IDs first, fall back to V3
  outputEl = document.getElementById('config-output') || document.getElementById('dsl-output');
  copyBtn = document.getElementById('btn-copy-config') || document.getElementById('btn-copy-dsl');

  if (!outputEl) {
    console.error('Config Output: Missing output element');
    return;
  }

  // Copy button handler
  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopy);
  }

  // Listen for config changes
  configStore.onChange(() => {
    render();
  });

  // Initial render
  render();
}

// Legacy export name for backwards compatibility
export { initConfigOutput as initDslOutput };

/**
 * Render the JSON output
 */
function render() {
  const config = configStore.getConfig();
  const json = JSON.stringify(config, null, 2);

  // Basic syntax highlighting (optional enhancement)
  outputEl.textContent = json;
}

/**
 * Handle copy button click
 */
async function handleCopy() {
  const config = configStore.getConfig();
  const json = JSON.stringify(config, null, 2);

  try {
    await navigator.clipboard.writeText(json);
    showCopyFeedback('Copied!');
  } catch (e) {
    console.error('Failed to copy:', e);
    // Fallback: select text
    selectOutput();
    showCopyFeedback('Select & copy manually');
  }
}

/**
 * Select the output text (fallback for copy)
 */
function selectOutput() {
  if (outputEl) {
    const range = document.createRange();
    range.selectNodeContents(outputEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Show temporary feedback on copy button
 * @param {string} text - Feedback text
 */
function showCopyFeedback(text) {
  if (!copyBtn) return;

  const original = copyBtn.textContent;
  copyBtn.textContent = text;
  copyBtn.disabled = true;

  setTimeout(() => {
    copyBtn.textContent = original;
    copyBtn.disabled = false;
  }, 1500);
}
