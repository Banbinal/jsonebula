/**
 * API Calls Tab UI - V4
 *
 * Displays and manages the list of API calls with their extraction paths.
 * Each API call defines how a JSON response should be parsed to extract entities.
 */

import { configStore } from '../../config/store.js';

let containerEl = null;
let addButtonEl = null;

/**
 * Initialize the API calls list
 */
export function initApiCallsList() {
  containerEl = document.getElementById('api-call-list');
  addButtonEl = document.getElementById('btn-add-api-call');

  if (!containerEl || !addButtonEl) {
    console.error('API Calls List: Missing DOM elements');
    return;
  }

  // Add button handler
  addButtonEl.addEventListener('click', handleAddApiCall);

  // Listen for config changes
  configStore.onChange(() => {
    render();
  });

  // Initial render
  render();
}

/**
 * Handle adding a new API call
 */
function handleAddApiCall() {
  const apiCallIds = configStore.getApiCallIds();
  let newId = 'api_call';
  let counter = 1;

  // Generate unique id
  while (apiCallIds.includes(newId)) {
    newId = `api_call_${counter++}`;
  }

  configStore.addApiCall(newId, {
    label: `API Call ${apiCallIds.length + 1}`,
    description: '',
    extractions: [],
  });
}

/**
 * Render the API calls list
 */
function render() {
  const apiCallIds = configStore.getApiCallIds();

  containerEl.innerHTML = '';

  if (apiCallIds.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <p>No API calls defined</p>
        <p style="font-size: 0.75rem;">Click + to add your first API call</p>
      </div>
    `;
    return;
  }

  apiCallIds.forEach(id => {
    const apiCall = configStore.getApiCall(id);
    const card = createApiCallCard(id, apiCall);
    containerEl.appendChild(card);
  });
}

/**
 * Create an API call card element
 * @param {string} id - API call id
 * @param {Object} apiCall - API call data
 * @returns {HTMLElement}
 */
function createApiCallCard(id, apiCall) {
  const card = document.createElement('div');
  card.className = 'api-call-card';
  card.dataset.apiCallId = id;

  const entityIds = configStore.getEntityIds();

  card.innerHTML = `
    <div class="api-call-card-header">
      <span class="api-call-label">${escapeHtml(apiCall.label)}</span>
      <button class="btn btn-icon btn-delete" title="Delete API call">&times;</button>
    </div>
    <div class="api-call-card-body">
      <div class="api-call-field">
        <label>Key</label>
        <input type="text" data-field="key" value="${escapeHtml(id)}" placeholder="api_call_key">
      </div>
      <div class="api-call-field">
        <label>Label</label>
        <input type="text" data-field="label" value="${escapeHtml(apiCall.label)}" placeholder="Display Name">
      </div>
      <div class="api-call-field">
        <label>Description</label>
        <input type="text" data-field="description" value="${escapeHtml(apiCall.description || '')}" placeholder="Optional description">
      </div>

      <div class="extractions-section">
        <div class="extractions-header">
          <h4>Extractions</h4>
          <button class="btn btn-icon btn-add-extraction" title="Add extraction">+</button>
        </div>
        <div class="extractions-list">
          ${renderExtractions(apiCall.extractions, entityIds)}
        </div>
      </div>
    </div>
  `;

  // Delete button
  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => {
    if (confirm(`Delete API call "${apiCall.label}"?`)) {
      configStore.deleteApiCall(id);
    }
  });

  // Field inputs
  card.querySelectorAll('.api-call-card-body > .api-call-field input').forEach(input => {
    const field = input.dataset.field;

    input.addEventListener('change', () => {
      const value = input.value.trim();

      if (field === 'key') {
        // Rename API call
        if (value && value !== id) {
          const success = configStore.renameApiCall(id, value);
          if (!success) {
            input.value = id; // Revert on failure
          }
        } else if (!value) {
          input.value = id; // Revert if empty
        }
      } else {
        // Update field
        configStore.updateApiCall(id, { [field]: value });
      }
    });

    input.addEventListener('blur', () => {
      input.dispatchEvent(new Event('change'));
    });
  });

  // Add extraction button
  const addExtractionBtn = card.querySelector('.btn-add-extraction');
  addExtractionBtn.addEventListener('click', () => {
    if (entityIds.length === 0) {
      alert('Please create at least one entity first');
      return;
    }
    configStore.addExtraction(id, entityIds[0], '$');
  });

  // Extraction row handlers
  setupExtractionHandlers(card, id, apiCall.extractions);

  return card;
}

/**
 * Render extractions for an API call
 * @param {Array} extractions - Extractions array
 * @param {Array} entityIds - Available entity IDs
 * @returns {string} HTML string
 */
function renderExtractions(extractions, entityIds) {
  if (!extractions || extractions.length === 0) {
    return `
      <div class="empty-state" style="text-align: center; padding: 0.5rem; color: var(--text-muted); font-size: 0.75rem;">
        No extractions
      </div>
    `;
  }

  return extractions.map((extraction, index) => {
    const entity = configStore.getEntity(extraction.entity);
    return `
      <div class="extraction-row" data-index="${index}">
        <select data-field="entity" title="Entity type to extract">
          ${entityIds.map(eid => {
            const e = configStore.getEntity(eid);
            const selected = eid === extraction.entity ? 'selected' : '';
            return `<option value="${eid}" ${selected}>${escapeHtml(e?.label || eid)}</option>`;
          }).join('')}
        </select>
        <input type="text" data-field="path" value="${escapeHtml(extraction.path)}" placeholder="$.items[*]" title="JSONPath-like extraction path">
        <button class="btn btn-icon btn-delete-extraction" title="Remove extraction">&times;</button>
      </div>
    `;
  }).join('');
}

/**
 * Setup event handlers for extraction rows
 * @param {HTMLElement} card - API call card element
 * @param {string} apiCallId - API call ID
 * @param {Array} extractions - Extractions array
 */
function setupExtractionHandlers(card, apiCallId, extractions) {
  card.querySelectorAll('.extraction-row').forEach(row => {
    const index = parseInt(row.dataset.index, 10);

    // Entity select
    const entitySelect = row.querySelector('select[data-field="entity"]');
    entitySelect.addEventListener('change', () => {
      configStore.updateExtraction(apiCallId, index, { entity: entitySelect.value });
    });

    // Path input
    const pathInput = row.querySelector('input[data-field="path"]');
    pathInput.addEventListener('change', () => {
      const value = pathInput.value.trim();
      if (value) {
        configStore.updateExtraction(apiCallId, index, { path: value });
      } else {
        pathInput.value = extractions[index]?.path || '$';
      }
    });
    pathInput.addEventListener('blur', () => {
      pathInput.dispatchEvent(new Event('change'));
    });

    // Delete button
    const deleteBtn = row.querySelector('.btn-delete-extraction');
    deleteBtn.addEventListener('click', () => {
      configStore.deleteExtraction(apiCallId, index);
    });
  });
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
