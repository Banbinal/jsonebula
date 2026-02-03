/**
 * Mapping Panel UI (V5)
 *
 * Modal panel for configuring entities, extractions, and relations.
 */

import { mappingStore } from '../../mapping/store.js';
import { callsStore } from '../../calls/store.js';
import { renderExtractablePaths, createEntityFromPath } from './path-picker.js';
import { evaluatePath } from '../../path/parser.js';

let modalEl = null;
let activeTab = 'entities';
let callbacks = {};

// Color palette for picker
const COLORS = [
  '#4F46E5', '#059669', '#DC2626', '#D97706',
  '#7C3AED', '#DB2777', '#0891B2', '#EA580C',
];

/**
 * Initialize the mapping panel
 * @param {Object} options - Callbacks
 * @param {Function} options.onApply - Called when mapping is applied
 */
export function initMappingPanel(options = {}) {
  callbacks = options;

  modalEl = document.getElementById('modal-mapping');
  if (!modalEl) return;

  // Tab switching
  modalEl.querySelectorAll('.mapping-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Add entity button
  const addEntityBtn = document.getElementById('btn-add-entity');
  if (addEntityBtn) {
    addEntityBtn.addEventListener('click', handleAddEntity);
  }

  // Add extraction button
  const addExtractionBtn = document.getElementById('btn-add-extraction');
  if (addExtractionBtn) {
    addExtractionBtn.addEventListener('click', handleAddExtraction);
  }

  // Add relation button
  const addRelationBtn = document.getElementById('btn-add-relation');
  if (addRelationBtn) {
    addRelationBtn.addEventListener('click', handleAddRelation);
  }

  // Apply button
  const applyBtn = document.getElementById('btn-apply-mapping');
  if (applyBtn) {
    applyBtn.addEventListener('click', handleApply);
  }

  // Close button and backdrop
  modalEl.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', closeMappingPanel);
  });

  // Listen for store changes
  mappingStore.onChange(() => render());
  callsStore.onChange(() => renderExtractionCallSelect());

  // Initial render
  render();
}

/**
 * Switch active tab
 */
function switchTab(tabName) {
  activeTab = tabName;

  // Update tab buttons
  modalEl.querySelectorAll('.mapping-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update panels
  modalEl.querySelectorAll('.mapping-panel').forEach(panel => {
    const panelTab = panel.id.replace('panel-', '');
    panel.classList.toggle('active', panelTab === tabName);
  });

  render();
}

/**
 * Render all sections
 */
function render() {
  renderEntities();
  renderExtractions();
  renderRelations();
}

/**
 * Render entities list
 */
function renderEntities() {
  const container = document.getElementById('entity-list');
  if (!container) return;

  const entities = mappingStore.getAllEntities();

  if (entities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No entities defined yet.</p>
        <p class="hint">Entities define the types of objects in your data.</p>
      </div>
    `;
    return;
  }

  const calls = callsStore.getAllCalls();

  // Search bar (preserve current query if re-rendering)
  const prevSearch = container.querySelector('.entity-search-input');
  const searchQuery = prevSearch ? prevSearch.value : '';

  const filteredEntities = searchQuery
    ? entities.filter(e =>
        e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entities;

  container.innerHTML = `
    <div class="entity-search">
      <input type="text" class="entity-search-input" placeholder="Search entities..." value="${escapeHtml(searchQuery)}">
    </div>
  ` + filteredEntities.map(entity => {
    const fields = getEntityFields(entity.id);
    const hasFields = fields.length > 0;
    const sources = getEntitySources(entity.id);

    return `
    <div class="entity-card" data-entity-id="${entity.id}">
      <div class="entity-card-header">
        <div class="entity-color" style="background-color: ${entity.color}" data-action="color"></div>
        <input type="text" class="entity-id-input" value="${escapeHtml(entity.id)}" data-field="id" placeholder="ID">
        <button class="btn btn-icon btn-delete" data-action="delete" title="Delete entity">&times;</button>
      </div>
      <div class="entity-card-body">
        <div class="entity-field">
          <label>Label</label>
          <input type="text" value="${escapeHtml(entity.label)}" data-field="label" placeholder="Display name">
        </div>
        <div class="entity-field">
          <label>PK Field</label>
          <input type="text" value="${escapeHtml(entity.pk)}" data-field="pk" placeholder="id or field1+field2"
            ${hasFields ? `list="pk-fields-${escapeHtml(entity.id)}"` : ''}>
          ${hasFields ? `
            <datalist id="pk-fields-${escapeHtml(entity.id)}">
              ${fields.map(f => `<option value="${escapeHtml(f)}">`).join('')}
            </datalist>
          ` : ''}
        </div>
        <div class="entity-field">
          <label>Display Field</label>
          ${hasFields ? `
            <select data-field="displayField">
              ${fields.map(f => `<option value="${escapeHtml(f)}" ${f === entity.displayField ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
            </select>
          ` : `
            <input type="text" value="${escapeHtml(entity.displayField)}" data-field="displayField" placeholder="e.g., name">
          `}
        </div>
        <div class="entity-sources">
          <label>Sources <span class="source-count">(${sources.length})</span></label>
          <div class="sources-list">
            ${sources.length > 0 ? sources.map(src => `
              <div class="source-row" data-call-id="${src.callId}" data-index="${src.index}">
                <span class="source-call">${escapeHtml(src.callName)}</span>
                <span class="source-path">${escapeHtml(src.path)}</span>
                <button class="btn btn-icon btn-remove-source" title="Remove source">&times;</button>
              </div>
            `).join('') : '<div class="no-sources">No sources defined</div>'}
          </div>
          <div class="add-source-row">
            <select class="add-source-call">
              ${calls.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
            </select>
            <input type="text" class="add-source-path" placeholder="$.path[*]" value="$">
            <button class="btn btn-small btn-add-source">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  // Search input handler
  const searchInput = container.querySelector('.entity-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderEntities());
    // Restore focus and cursor position after re-render
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  // Add event listeners
  container.querySelectorAll('.entity-card').forEach(card => {
    const entityId = card.dataset.entityId;

    // Field changes (both inputs and selects)
    card.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        const value = el.value.trim();

        if (field === 'id') {
          if (value && value !== entityId) {
            mappingStore.renameEntity(entityId, value);
          }
        } else {
          mappingStore.setEntity(entityId, { [field]: value });
        }
      });
    });

    // Color picker
    const colorEl = card.querySelector('[data-action="color"]');
    if (colorEl) {
      colorEl.addEventListener('click', (e) => {
        showColorPicker(e.target, entityId);
      });
    }

    // Delete
    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete entity "${entityId}"?`)) {
          mappingStore.deleteEntity(entityId);
        }
      });
    }

    // Remove source buttons
    card.querySelectorAll('.btn-remove-source').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.source-row');
        const callId = row.dataset.callId;
        const index = parseInt(row.dataset.index, 10);

        const call = callsStore.getCall(callId);
        if (call) {
          const extractions = [...(call.extractions || [])];
          extractions.splice(index, 1);
          callsStore.updateExtractions(callId, extractions);
          renderEntities();
        }
      });
    });

    // Add source button
    const addSourceBtn = card.querySelector('.btn-add-source');
    if (addSourceBtn) {
      addSourceBtn.addEventListener('click', () => {
        const callSelect = card.querySelector('.add-source-call');
        const pathInput = card.querySelector('.add-source-path');
        const callId = callSelect.value;
        const path = pathInput.value.trim();

        if (callId && path) {
          const call = callsStore.getCall(callId);
          if (call) {
            const extractions = [...(call.extractions || [])];
            extractions.push({ entity: entityId, path });
            callsStore.updateExtractions(callId, extractions);
            pathInput.value = '$';
            renderEntities();
          }
        }
      });
    }
  });
}

/**
 * Show color picker
 */
function showColorPicker(anchorEl, entityId) {
  // Remove existing picker
  const existingPicker = document.querySelector('.color-picker-popup');
  if (existingPicker) existingPicker.remove();

  const picker = document.createElement('div');
  picker.className = 'color-picker-popup';
  picker.innerHTML = COLORS.map(color => `
    <div class="color-option" style="background-color: ${color}" data-color="${color}"></div>
  `).join('');

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${rect.left}px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    z-index: 1001;
  `;

  document.body.appendChild(picker);

  // Color selection
  picker.querySelectorAll('.color-option').forEach(option => {
    option.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
    `;
    option.addEventListener('click', () => {
      mappingStore.setEntity(entityId, { color: option.dataset.color });
      picker.remove();
    });
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target) && e.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

// Track selected call for extractions tab
let selectedExtractionCallId = null;

/**
 * Render extraction call select
 */
function renderExtractionCallSelect() {
  const select = document.getElementById('extraction-call-select');
  if (!select) return;

  const calls = callsStore.getAllCalls();

  // Preserve current selection or use first call
  const currentValue = selectedExtractionCallId || select.value;

  select.innerHTML = calls.map(call => `
    <option value="${call.id}" ${call.id === currentValue ? 'selected' : ''}>${escapeHtml(call.name)}</option>
  `).join('');

  // Update tracked selection
  if (calls.length > 0) {
    selectedExtractionCallId = select.value;
  }
}

/**
 * Render extractions list
 */
function renderExtractions() {
  const container = document.getElementById('extraction-list');
  if (!container) return;

  renderExtractionCallSelect();

  const select = document.getElementById('extraction-call-select');
  const selectedCallId = selectedExtractionCallId || select?.value;

  if (!selectedCallId) {
    container.innerHTML = `<div class="empty-state"><p>Select a call first.</p></div>`;
    return;
  }

  const call = callsStore.getCall(selectedCallId);
  if (!call) {
    container.innerHTML = `<div class="empty-state"><p>Call not found.</p></div>`;
    return;
  }

  const extractions = call.extractions || [];
  const entities = mappingStore.getAllEntities();

  // Show current extractions
  let html = '';

  // Prominent CTA when no entities exist yet
  if (entities.length === 0) {
    html += `
      <div class="extraction-cta">
        <p>No entities yet — extract paths from your data to create them.</p>
        <button class="btn btn-primary btn-extract-all-cta" id="btn-extract-all-cta">Extract All Paths</button>
        <p class="hint">Or click individual paths below to extract them one by one.</p>
      </div>
    `;
  }

  if (extractions.length > 0) {
    html += `
      <div class="extractions-current">
        <h5>Current Extractions</h5>
        ${extractions.map((ext, idx) => `
          <div class="extraction-row" data-index="${idx}">
            <select data-field="entity">
              <option value="">-- Entity --</option>
              ${entities.map(e => `
                <option value="${e.id}" ${e.id === ext.entity ? 'selected' : ''}>${escapeHtml(e.label)}</option>
              `).join('')}
            </select>
            <input type="text" value="${escapeHtml(ext.path || '')}" data-field="path" placeholder="e.g., $.items[*]">
            <button class="btn btn-icon btn-delete" data-action="delete">&times;</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Show path picker with extractable paths
  html += `
    <div class="extractions-picker">
      <h5>Available Paths</h5>
      <p class="hint">Click to extract as entity:</p>
      ${renderExtractablePaths(selectedCallId)}
    </div>
  `;

  container.innerHTML = html;

  // Event listeners for current extractions
  container.querySelectorAll('.extraction-row').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);

    row.querySelectorAll('select, input').forEach(el => {
      el.addEventListener('change', () => {
        const extractions = [...(call.extractions || [])];
        extractions[idx] = {
          ...extractions[idx],
          [el.dataset.field]: el.value,
        };
        callsStore.updateExtractions(selectedCallId, extractions);
      });
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      const extractions = [...(call.extractions || [])];
      extractions.splice(idx, 1);
      callsStore.updateExtractions(selectedCallId, extractions);
      renderExtractions();
    });
  });

  // Event listeners for path picker
  container.querySelectorAll('.btn-extract').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.path;
      const type = btn.dataset.type || null;
      let sample = {};
      try {
        sample = JSON.parse(btn.dataset.sample || '{}');
      } catch (e) {}

      // Create entity and add extraction
      const result = createEntityFromPath(path, sample, type);

      const extractions = [...(call.extractions || [])];
      extractions.push({
        entity: result.entityId,
        path: path,
      });
      callsStore.updateExtractions(selectedCallId, extractions);

      // Re-render
      render();
    });
  });

  // Extract All button
  const extractAllBtn = document.getElementById('btn-extract-all');
  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => {
      const buttons = container.querySelectorAll('.btn-extract');
      if (buttons.length === 0) return;

      // Use batch mode to avoid rebuilding graph for each extraction
      callsStore.startBatch();
      mappingStore.startBatch();

      try {
        // Collect all new extractions first
        const newExtractions = [];

        buttons.forEach(btn => {
          const path = btn.dataset.path;
          const type = btn.dataset.type || null;
          let sample = {};
          try {
            sample = JSON.parse(btn.dataset.sample || '{}');
          } catch (e) {}

          const result = createEntityFromPath(path, sample, type);
          newExtractions.push({
            entity: result.entityId,
            path: path,
          });
        });

        // Update extractions in one go
        const currentCall = callsStore.getCall(selectedCallId);
        const extractions = [...(currentCall.extractions || []), ...newExtractions];
        callsStore.updateExtractions(selectedCallId, extractions);

      } finally {
        // End batch mode - triggers single rebuild
        mappingStore.endBatch();
        callsStore.endBatch();
      }

      render();
    });
  }

  // CTA Extract All button (shown when no entities exist)
  const ctaBtn = document.getElementById('btn-extract-all-cta');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      // Delegate to the same extract-all logic
      const extractAllBtn = document.getElementById('btn-extract-all');
      if (extractAllBtn) {
        extractAllBtn.click();
      }
    });
  }

  // Call select change
  if (select) {
    select.onchange = () => {
      selectedExtractionCallId = select.value;
      renderExtractions();
    };
  }
}

/**
 * Render relations list
 */
function renderRelations() {
  const container = document.getElementById('relation-list');
  if (!container) return;

  const relations = mappingStore.getRelations();
  const entities = mappingStore.getAllEntities();

  if (relations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No relations defined.</p>
        <p class="hint">Relations link entities via foreign keys.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = relations.map((rel, idx) => `
    <div class="relation-row-v4" data-index="${idx}">
      <div class="relation-field-group">
        <div class="field-label">From</div>
        <select data-field="from">
          <option value="">-- Entity --</option>
          ${entities.map(e => `
            <option value="${e.id}" ${e.id === rel.from ? 'selected' : ''}>${escapeHtml(e.label)}</option>
          `).join('')}
        </select>
      </div>
      <span class="relation-arrow">→</span>
      <div class="relation-field-group">
        <div class="field-label">To</div>
        <select data-field="to">
          <option value="">-- Entity --</option>
          ${entities.map(e => `
            <option value="${e.id}" ${e.id === rel.to ? 'selected' : ''}>${escapeHtml(e.label)}</option>
          `).join('')}
        </select>
      </div>
      <span class="relation-arrow">via</span>
      <div class="relation-field-group">
        <div class="field-label">FK Path</div>
        <input type="text" value="${escapeHtml(rel.toFk || '')}" data-field="toFk" placeholder="e.g., client_id">
      </div>
      <button class="btn btn-icon btn-delete" data-action="delete">&times;</button>
    </div>
  `).join('');

  // Event listeners
  container.querySelectorAll('.relation-row-v4').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);

    row.querySelectorAll('select, input').forEach(el => {
      el.addEventListener('change', () => {
        mappingStore.updateRelation(idx, { [el.dataset.field]: el.value });
      });
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      mappingStore.deleteRelation(idx);
    });
  });
}

/**
 * Handle add entity
 */
function handleAddEntity() {
  mappingStore.createEntity();
}

/**
 * Handle add extraction
 */
function handleAddExtraction() {
  const select = document.getElementById('extraction-call-select');
  const callId = select?.value;
  if (!callId) {
    alert('Please select a call first.');
    return;
  }

  const call = callsStore.getCall(callId);
  const extractions = [...(call?.extractions || [])];
  extractions.push({ entity: '', path: '$' });
  callsStore.updateExtractions(callId, extractions);
  renderExtractions();
}

/**
 * Handle add relation
 */
function handleAddRelation() {
  const entities = mappingStore.getAllEntities();
  if (entities.length < 2) {
    alert('You need at least 2 entities to create a relation.');
    return;
  }

  mappingStore.addRelation(entities[0].id, entities[1].id, '');
}

/**
 * Handle apply
 */
function handleApply() {
  if (callbacks.onApply) {
    callbacks.onApply();
  }

  // Close modal
  modalEl?.classList.remove('open');
}

/**
 * Open the mapping panel
 */
export function openMappingPanel() {
  if (modalEl) {
    // If no entities exist yet, land on extractions tab
    const entities = mappingStore.getAllEntities();
    if (entities.length === 0) {
      activeTab = 'extractions';
      modalEl.querySelectorAll('.mapping-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === 'extractions');
      });
      modalEl.querySelectorAll('.mapping-panel').forEach(panel => {
        const panelTab = panel.id.replace('panel-', '');
        panel.classList.toggle('active', panelTab === 'extractions');
      });
    }

    modalEl.classList.add('open');
    render();
  }
}

/**
 * Close the mapping panel
 */
export function closeMappingPanel() {
  if (modalEl) {
    modalEl.classList.remove('open');
  }
}

/**
 * Get all sources (extractions) for an entity across all calls
 * @param {string} entityId - Entity ID
 * @returns {Array<{callId: string, callName: string, path: string, index: number}>}
 */
function getEntitySources(entityId) {
  const calls = callsStore.getAllCalls();
  const sources = [];

  for (const call of calls) {
    if (!call.extractions) continue;

    call.extractions.forEach((extraction, index) => {
      if (extraction.entity === entityId) {
        sources.push({
          callId: call.id,
          callName: call.name,
          path: extraction.path,
          index
        });
      }
    });
  }

  return sources;
}

/**
 * Get available fields for an entity by looking at extractions
 * @param {string} entityId - Entity ID
 * @returns {Array<string>} List of field names
 */
function getEntityFields(entityId) {
  const calls = callsStore.getAllCalls();
  const fieldsSet = new Set();

  for (const call of calls) {
    if (!call.parsedJson || !call.extractions) continue;

    for (const extraction of call.extractions) {
      if (extraction.entity !== entityId || !extraction.path) continue;

      // Extract objects at this path
      const results = evaluatePath(call.parsedJson, extraction.path);

      for (const result of results) {
        if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
          // Collect all primitives including nested ones (flattened)
          const primitives = collectPrimitivesDeep(result.value);
          for (const key of Object.keys(primitives)) {
            // Convert internal __ to . for display
            fieldsSet.add(key.replace(/__/g, '.'));
          }
        }
      }
    }
  }

  return Array.from(fieldsSet).sort();
}

/**
 * Collect all primitives from an object, flattening nested objects
 * Uses __ as separator (same as raw.js)
 */
function collectPrimitivesDeep(obj, prefix = '') {
  const primitives = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}__${key}` : key;

    if (value === null || typeof value !== 'object') {
      primitives[fullKey] = value;
    } else if (!Array.isArray(value)) {
      Object.assign(primitives, collectPrimitivesDeep(value, fullKey));
    }
  }

  return primitives;
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
