/**
 * JSON Input Modal V4
 *
 * Modal component for importing JSON data by selecting an API call type.
 * Shows preview of what entities will be extracted before importing.
 */

import { configStore } from '../../config/store.js';
import { dataStore } from '../../data/store.js';
import { extractFromCall, previewFromCall } from '../../extraction/engine.js';

let modal = null;
let selectEl = null;
let hintEl = null;
let textareaEl = null;
let previewEl = null;
let errorEl = null;
let submitBtn = null;
let onSuccessCallback = null;

// Debounce timer for preview
let previewTimeout = null;

/**
 * Initialize the JSON input modal
 */
export function initJsonInputModal() {
  modal = document.getElementById('modal-json-input');
  selectEl = document.getElementById('json-api-call');
  hintEl = document.getElementById('api-call-hint');
  textareaEl = document.getElementById('json-input');
  previewEl = document.getElementById('extraction-preview');
  errorEl = document.getElementById('json-error');
  submitBtn = document.getElementById('btn-json-submit');

  if (!modal || !selectEl || !textareaEl || !errorEl || !submitBtn) {
    console.error('JSON Input Modal: Missing DOM elements');
    return;
  }

  // Populate API call types
  populateApiCalls();

  // Listen for config changes to update API calls
  configStore.onChange(() => {
    populateApiCalls();
  });

  // API call selection change
  selectEl.addEventListener('change', () => {
    updateHint();
    updatePreview();
  });

  // Text input change (debounced preview)
  textareaEl.addEventListener('input', () => {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(updatePreview, 300);
  });

  // Submit button handler
  submitBtn.addEventListener('click', handleSubmit);

  // Close button handlers
  modal.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  // Backdrop click to close
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  // Enter key in textarea (Ctrl+Enter to submit)
  textareaEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  });

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }
  });
}

/**
 * Populate the API call dropdown from config
 */
function populateApiCalls() {
  if (!selectEl) return;

  const apiCallIds = configStore.getApiCallIds();
  const currentValue = selectEl.value;

  selectEl.innerHTML = '';

  if (apiCallIds.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '(No API calls defined)';
    option.disabled = true;
    selectEl.appendChild(option);
    submitBtn.disabled = true;
    if (hintEl) hintEl.textContent = 'Define API calls in the Mapping tab first';
    return;
  }

  apiCallIds.forEach(id => {
    const apiCall = configStore.getApiCall(id);
    const option = document.createElement('option');
    option.value = id;
    option.textContent = apiCall.label || id;
    selectEl.appendChild(option);
  });

  // Restore selection if still valid
  if (apiCallIds.includes(currentValue)) {
    selectEl.value = currentValue;
  }

  submitBtn.disabled = false;
  updateHint();
}

/**
 * Update the hint text based on selected API call
 */
function updateHint() {
  if (!hintEl || !selectEl) return;

  const apiCallId = selectEl.value;
  if (!apiCallId) {
    hintEl.textContent = '';
    return;
  }

  const apiCall = configStore.getApiCall(apiCallId);
  if (!apiCall) {
    hintEl.textContent = '';
    return;
  }

  // Show description or extraction summary
  if (apiCall.description) {
    hintEl.textContent = apiCall.description;
  } else {
    const entityNames = apiCall.extractions.map(e => {
      const entity = configStore.getEntity(e.entity);
      return entity?.label || e.entity;
    });
    if (entityNames.length > 0) {
      hintEl.textContent = `Extracts: ${entityNames.join(', ')}`;
    } else {
      hintEl.textContent = 'No extractions configured';
    }
  }
}

/**
 * Update the extraction preview
 */
function updatePreview() {
  if (!previewEl || !selectEl) return;

  const apiCallId = selectEl.value;
  const jsonText = textareaEl?.value?.trim();

  // Hide preview if no data or no API call
  if (!apiCallId || !jsonText) {
    previewEl.classList.add('hidden');
    return;
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    previewEl.classList.add('hidden');
    return;
  }

  // Get preview
  const preview = previewFromCall(apiCallId, parsed);

  if (!preview.success || Object.keys(preview.counts).length === 0) {
    previewEl.innerHTML = `
      <h4>Preview</h4>
      <div class="extraction-preview-item" style="color: var(--text-muted);">
        No entities would be extracted
      </div>
    `;
    previewEl.classList.remove('hidden');
    return;
  }

  // Render preview
  const items = Object.entries(preview.counts).map(([entityId, count]) => {
    const entity = configStore.getEntity(entityId);
    const color = entity?.color || '#888';
    const label = entity?.label || entityId;

    return `
      <div class="extraction-preview-item">
        <span class="extraction-preview-entity">
          <span class="extraction-preview-color" style="background-color: ${color}"></span>
          ${escapeHtml(label)}
        </span>
        <span class="extraction-preview-count">${count} item${count !== 1 ? 's' : ''}</span>
      </div>
    `;
  }).join('');

  previewEl.innerHTML = `<h4>Preview</h4>${items}`;
  previewEl.classList.remove('hidden');
}

/**
 * Open the modal
 * @param {Object} options - Options
 * @param {string} options.apiCallId - Pre-selected API call
 * @param {Function} options.onSuccess - Callback on successful import
 */
export function openJsonInputModal(options = {}) {
  if (!modal) {
    console.error('JSON Input Modal not initialized');
    return;
  }

  // Reset form
  textareaEl.value = '';
  errorEl.textContent = '';
  errorEl.style.display = 'none';
  if (previewEl) previewEl.classList.add('hidden');

  // Pre-select API call if provided
  if (options.apiCallId && configStore.getApiCallIds().includes(options.apiCallId)) {
    selectEl.value = options.apiCallId;
  }

  updateHint();

  // Store success callback
  onSuccessCallback = options.onSuccess || null;

  // Show modal
  modal.classList.add('open');

  // Focus textarea
  setTimeout(() => textareaEl.focus(), 100);
}

/**
 * Close the modal
 */
export function closeModal() {
  if (modal) {
    modal.classList.remove('open');
    onSuccessCallback = null;
  }
}

/**
 * Handle form submission
 */
function handleSubmit() {
  const apiCallId = selectEl.value;
  const jsonText = textareaEl.value.trim();

  // Validate API call
  if (!apiCallId) {
    showError('Please select an API call type');
    return;
  }

  // Validate JSON is not empty
  if (!jsonText) {
    showError('Please paste some JSON data');
    return;
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    showError(`Invalid JSON: ${e.message}`);
    return;
  }

  // Extract entities using the V4 extraction engine
  const extractionResult = extractFromCall(apiCallId, parsed);

  if (!extractionResult.success) {
    showError(extractionResult.error || 'Extraction failed');
    return;
  }

  if (extractionResult.entities.length === 0) {
    showError('No entities were extracted. Check the API call configuration.');
    return;
  }

  // Add to data store
  const result = dataStore.addFromExtraction(extractionResult);

  // Close modal
  closeModal();

  // Call success callback
  if (onSuccessCallback) {
    onSuccessCallback({
      apiCallId,
      added: result.added,
      updated: result.updated,
      entities: extractionResult.entities.length,
      intraEdges: extractionResult.intraEdges.length,
    });
  }
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string}
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
