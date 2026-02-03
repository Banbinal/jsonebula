/**
 * Calls Tabs UI (V5)
 *
 * Renders the list of call tabs in the left panel.
 * - Click to select a call
 * - Double-click to rename
 * - Add new calls
 */

import { callsStore } from '../../calls/store.js';

let containerEl = null;
let addBtnEl = null;
let callbacks = {};
let isRenaming = false;

/**
 * Initialize the calls tabs UI
 * @param {Object} options - Callbacks
 * @param {Function} options.onCallSelect - Called when a call is selected
 */
export function initCallsTabs(options = {}) {
  callbacks = options;

  containerEl = document.getElementById('calls-list');
  addBtnEl = document.getElementById('btn-add-call');

  if (!containerEl) {
    console.error('Calls tabs container not found');
    return;
  }

  // Add button
  if (addBtnEl) {
    addBtnEl.addEventListener('click', handleAddCall);
  }

  // Listen for store changes
  callsStore.onChange(() => {
    render();
  });

  // Initial render
  render();
}

/**
 * Render the calls list
 */
function render() {
  if (!containerEl) return;
  if (isRenaming) return; // Don't re-render during rename

  const calls = callsStore.getAllCalls();
  const activeCallId = callsStore.getActiveCallId();

  if (calls.length === 0) {
    containerEl.innerHTML = `
      <div class="calls-empty">
        <p>No calls yet</p>
      </div>
    `;
    return;
  }

  containerEl.innerHTML = calls.map(call => {
    const isActive = call.id === activeCallId;
    const statusClass = getStatusClass(call);

    return `
      <div class="call-tab ${isActive ? 'active' : ''}" data-call-id="${call.id}" title="${escapeHtml(call.name)}">
        <div class="call-tab-indicator ${statusClass}"></div>
        <span class="call-tab-name">${escapeHtml(call.name)}</span>
      </div>
    `;
  }).join('');

  // Add event listeners
  containerEl.querySelectorAll('.call-tab').forEach(tab => {
    tab.addEventListener('click', handleTabClick);
    tab.addEventListener('dblclick', handleTabDoubleClick);
  });
}

/**
 * Get status class for call indicator
 */
function getStatusClass(call) {
  if (!call.json || call.json.trim() === '') {
    return 'empty';
  }
  if (call.parseError) {
    return 'invalid';
  }
  return 'valid';
}

let clickTimeout = null;
let pendingClickCallId = null;

/**
 * Handle tab click (select call)
 * Uses delay to allow double-click to fire first
 */
function handleTabClick(e) {
  const callId = e.currentTarget.dataset.callId;

  // Clear any pending click
  if (clickTimeout) {
    clearTimeout(clickTimeout);
    clickTimeout = null;
  }

  pendingClickCallId = callId;

  // Delay the actual selection to allow double-click to cancel it
  clickTimeout = setTimeout(() => {
    if (pendingClickCallId === callId) {
      callsStore.setActiveCall(callId);
      if (callbacks.onCallSelect) {
        callbacks.onCallSelect(callId);
      }
    }
    pendingClickCallId = null;
    clickTimeout = null;
  }, 250);
}

/**
 * Handle tab double-click (rename)
 */
function handleTabDoubleClick(e) {
  e.stopPropagation();
  e.preventDefault();

  // Cancel pending single click
  if (clickTimeout) {
    clearTimeout(clickTimeout);
    clickTimeout = null;
  }
  pendingClickCallId = null;

  const tabEl = e.currentTarget;
  const callId = tabEl.dataset.callId;
  const call = callsStore.getCall(callId);
  if (!call) return;

  // Set renaming flag to prevent re-render
  isRenaming = true;

  // Make sure this tab is active first
  if (callsStore.getActiveCallId() !== callId) {
    callsStore.setActiveCall(callId);
    if (callbacks.onCallSelect) {
      callbacks.onCallSelect(callId);
    }
  }

  const nameEl = tabEl.querySelector('.call-tab-name');
  const currentName = call.name;

  // Create input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'call-tab-name-input';
  input.value = currentName;

  // Replace name with input
  nameEl.style.display = 'none';
  tabEl.insertBefore(input, nameEl.nextSibling);
  input.focus();
  input.select();

  // Handle blur (save)
  const handleBlur = () => {
    const newName = input.value.trim() || currentName;
    cleanup();
    callsStore.updateName(callId, newName);
  };

  // Handle keydown
  const handleKeydown = (e) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      cleanup();
      render(); // Re-render to restore original name display
    }
  };

  // Cleanup - after this, store update will trigger render
  const cleanup = () => {
    input.removeEventListener('blur', handleBlur);
    input.removeEventListener('keydown', handleKeydown);
    isRenaming = false;
  };

  input.addEventListener('blur', handleBlur);
  input.addEventListener('keydown', handleKeydown);
}

/**
 * Handle add call button
 */
function handleAddCall() {
  const callId = callsStore.createCall();
  callsStore.setActiveCall(callId);

  if (callbacks.onCallSelect) {
    callbacks.onCallSelect(callId);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get current active call ID
 */
export function getActiveCallId() {
  return callsStore.getActiveCallId();
}
