/**
 * Node Detail Sidebar (V5)
 *
 * Shows details of a selected node in the right panel.
 * Supports both raw JSON nodes and mapped entity nodes.
 */

import { mappingStore } from '../mapping/store.js';
import { callsStore } from '../calls/store.js';

/**
 * Get all sources for an entity across all calls
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

let panelEl = null;
let detailsEl = null;
let closeBtnEl = null;
let callbacks = {};

/**
 * Initialize the sidebar
 * @param {Object} options - Callbacks
 * @param {Function} options.onNodeNavigate - Called when user clicks a related node
 * @param {Function} options.onClose - Called when sidebar closes
 */
export function initSidebar(options = {}) {
  callbacks = options;

  panelEl = document.getElementById('right-panel');
  detailsEl = document.getElementById('node-details');
  closeBtnEl = document.getElementById('btn-close-sidebar');

  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', hideSidebar);
  }
}

/**
 * Show raw JSON node details
 * @param {Object} nodeData - Cytoscape node data
 */
export function showRawNodeDetails(nodeData) {
  if (!panelEl || !detailsEl) return;

  const { id, nodeType, path, rawData, primitives, label, callId } = nodeData;

  // Get available entities for mapping
  const entities = mappingStore.getAllEntities();
  const currentEntityType = nodeData.entityType || '';

  // Get available fields from rawData (for PK selection)
  const availableFields = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
    ? Object.keys(rawData).filter(k => {
        const v = rawData[k];
        return typeof v === 'string' || typeof v === 'number';
      })
    : [];

  let html = `
    <div class="raw-node-type ${nodeType}">${nodeType}</div>
    <div class="raw-node-path">${escapeHtml(path)}</div>
  `;

  // Entity mapping section - only for objects
  if (nodeType === 'object') {
    html += `
      <div class="node-detail-section">
        <h4>Map as Entity</h4>
        <div class="entity-mapping-form">
          <div class="mapping-row">
            <label>Entity Type</label>
            <select id="sidebar-entity-select" class="entity-select">
              <option value="">— Select entity —</option>
              ${entities.map(e => `
                <option value="${e.id}" ${currentEntityType === e.id ? 'selected' : ''}>
                  ${escapeHtml(e.label)}
                </option>
              `).join('')}
              <option value="__new__">+ Create new entity...</option>
            </select>
          </div>
          <div class="mapping-row" id="pk-field-row" style="display: none;">
            <label>Primary Key Field</label>
            <select id="sidebar-pk-select" class="entity-select">
              ${availableFields.map(f => `
                <option value="${f}" ${f === 'id' ? 'selected' : ''}>${escapeHtml(f)}</option>
              `).join('')}
            </select>
          </div>
          <div class="mapping-row" id="new-entity-row" style="display: none;">
            <label>Entity Name</label>
            <input type="text" id="sidebar-new-entity-name" placeholder="e.g., Facture" />
          </div>
          <button class="btn btn-primary" id="btn-add-entity-source" style="display: none;">
            Add as Source
          </button>
        </div>
      </div>
    `;
  }

  // Show primitives for objects
  if (nodeType === 'object' && primitives && Object.keys(primitives).length > 0) {
    html += `
      <div class="raw-node-preview">
        <h4>Properties</h4>
        <div class="raw-node-properties">
          ${Object.entries(primitives).map(([key, value]) => `
            <div class="raw-property">
              <span class="raw-property-key">${escapeHtml(key.replace(/__/g, '.'))}:</span>
              <span class="raw-property-value">${formatValue(value)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Show array info
  if (nodeType === 'array' && rawData) {
    html += `
      <div class="raw-node-preview">
        <h4>Array Info</h4>
        <div class="raw-node-properties">
          <div class="raw-property">
            <span class="raw-property-key">Length:</span>
            <span class="raw-property-value">${rawData.length}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Full JSON
  html += `
    <div class="node-detail-section">
      <h4>Full Data</h4>
      <div class="node-detail-json">
        <pre class="code-block">${escapeHtml(JSON.stringify(rawData, null, 2))}</pre>
      </div>
      <div class="sidebar-actions">
        <button class="btn btn-small" id="btn-copy-json">Copy JSON</button>
        <button class="btn btn-small" id="btn-copy-path">Copy Path</button>
      </div>
    </div>
  `;

  detailsEl.innerHTML = html;

  // Entity mapping handlers
  const entitySelect = document.getElementById('sidebar-entity-select');
  const pkFieldRow = document.getElementById('pk-field-row');
  const newEntityRow = document.getElementById('new-entity-row');
  const addSourceBtn = document.getElementById('btn-add-entity-source');
  const pkSelect = document.getElementById('sidebar-pk-select');
  const newEntityNameInput = document.getElementById('sidebar-new-entity-name');

  if (entitySelect) {
    entitySelect.addEventListener('change', () => {
      const value = entitySelect.value;
      if (value === '__new__') {
        // Creating new entity
        if (pkFieldRow) pkFieldRow.style.display = 'flex';
        if (newEntityRow) newEntityRow.style.display = 'flex';
        if (addSourceBtn) addSourceBtn.style.display = 'block';
      } else if (value) {
        // Existing entity selected
        if (pkFieldRow) pkFieldRow.style.display = 'flex';
        if (newEntityRow) newEntityRow.style.display = 'none';
        if (addSourceBtn) addSourceBtn.style.display = 'block';

        // Pre-select PK from entity config
        const entityConfig = mappingStore.getEntity(value);
        if (entityConfig && entityConfig.pk && pkSelect) {
          pkSelect.value = entityConfig.pk;
        }
      } else {
        // No selection
        if (pkFieldRow) pkFieldRow.style.display = 'none';
        if (newEntityRow) newEntityRow.style.display = 'none';
        if (addSourceBtn) addSourceBtn.style.display = 'none';
      }
    });
  }

  if (addSourceBtn) {
    addSourceBtn.addEventListener('click', () => {
      const selectedEntity = entitySelect.value;
      const selectedPk = pkSelect?.value || 'id';

      if (selectedEntity === '__new__') {
        // Create new entity
        const newName = newEntityNameInput?.value?.trim();
        if (!newName) {
          alert('Please enter an entity name');
          return;
        }
        const entityId = newName.toLowerCase().replace(/\s+/g, '_');

        // Create the entity
        mappingStore.setEntity(entityId, {
          label: newName,
          pk: selectedPk,
          displayField: selectedPk,
          color: getRandomColor(),
        });

        // Add extraction
        addEntitySource(callId, path, entityId);
      } else if (selectedEntity) {
        // Add source to existing entity
        addEntitySource(callId, path, selectedEntity);
      }
    });
  }

  // Copy handlers
  const copyJsonBtn = document.getElementById('btn-copy-json');
  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', () => copyToClipboard(JSON.stringify(rawData, null, 2), copyJsonBtn));
  }

  const copyPathBtn = document.getElementById('btn-copy-path');
  if (copyPathBtn) {
    copyPathBtn.addEventListener('click', () => copyToClipboard(path, copyPathBtn));
  }

  showSidebar();
}

/**
 * Add a new entity source (extraction)
 * Converts specific index paths to wildcard paths to map all siblings
 * e.g., $[0] -> $[*], $.items[0] -> $.items[*]
 */
function addEntitySource(callId, path, entityType) {
  const call = callsStore.getCall(callId);
  if (!call) {
    console.error('addEntitySource: call not found for callId:', callId);
    return;
  }

  // Convert path to JSONPath format
  let jsonPath = toJsonPath(path);

  // Convert specific indices to wildcards to map all siblings
  // $[0] -> $[*], $.items[2] -> $.items[*]
  jsonPath = jsonPath.replace(/\[\d+\]/g, '[*]');

  const extractions = [...(call.extractions || [])];

  // Check if this exact extraction already exists
  const exists = extractions.some(e => e.entity === entityType && e.path === jsonPath);
  if (!exists) {
    extractions.push({ entity: entityType, path: jsonPath });
    callsStore.updateExtractions(callId, extractions);

    // Hide sidebar - user should reselect node to see updated state
    hideSidebar();
  }
}

/**
 * Generate a random color for new entities
 */
function getRandomColor() {
  const colors = [
    '#4F46E5', '#059669', '#7C3AED', '#D97706', '#DC2626',
    '#0891B2', '#BE185D', '#65A30D', '#6366F1', '#EA580C'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Source colors for property visualization
const SOURCE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

/**
 * Show mapped entity node details
 * @param {Object} nodeData - Cytoscape node data
 * @param {Object} entityConfig - Entity configuration
 * @param {Array} parents - Parent nodes
 * @param {Array} children - Child nodes
 */
export function showMappedNodeDetails(nodeData, entityConfig, parents = [], children = []) {
  if (!panelEl || !detailsEl) return;

  const { label, color, entityType, entityData, path, callId, primitives, sourceCount } = nodeData;
  const entityLabel = entityConfig?.label || entityType;
  const currentDisplayField = entityConfig?.displayField || 'id';

  // Get sources and property sources from nodeData (set by computeNodeMappings)
  const nodeSources = nodeData.sources || [];
  const propertySources = nodeData.propertySources || {};

  // Get available fields from entityData
  const availableFields = entityData ? Object.keys(entityData).filter(k => {
    const v = entityData[k];
    return v === null || typeof v !== 'object';
  }) : [];

  // Get all extraction sources for this entity type
  const extractionSources = getEntitySources(entityType);
  const calls = callsStore.getAllCalls();

  let html = `
    <div class="node-detail-badge" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}">
      ${escapeHtml(entityLabel)}
    </div>
    <div class="node-detail-title">${escapeHtml(String(label))}</div>
  `;

  // Sources legend (if multiple sources)
  if (nodeSources.length > 1) {
    html += `
      <div class="node-detail-section">
        <h4>Sources (${nodeSources.length})</h4>
        <div class="sources-legend">
          ${nodeSources.map((src, idx) => `
            <div class="source-legend-item">
              <span class="source-color-dot" style="background-color: ${SOURCE_COLORS[idx % SOURCE_COLORS.length]}"></span>
              <span class="source-legend-name">${escapeHtml(src.callName)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Conflicts section (if any)
  const conflicts = nodeData.conflicts || {};
  const conflictKeys = Object.keys(conflicts);
  if (conflictKeys.length > 0) {
    html += `
      <div class="node-detail-section conflicts-section">
        <h4 class="conflicts-header">⚠️ Conflicts (${conflictKeys.length})</h4>
        <div class="conflicts-list">
          ${conflictKeys.map(key => {
            const conflictList = conflicts[key];
            // Get all values for this key (including the winner)
            const allValues = [];
            const propSources = propertySources[key] || [];

            // Build a map of sourceIndex -> value from propertySources
            for (const src of propSources) {
              const srcInfo = nodeSources[src.sourceIndex];
              const srcColor = SOURCE_COLORS[src.sourceIndex % SOURCE_COLORS.length];
              allValues.push({
                callName: src.callName,
                value: src.value,
                color: srcColor,
                isWinner: src.sourceIndex === propSources[propSources.length - 1]?.sourceIndex,
              });
            }

            return `
              <div class="conflict-item">
                <div class="conflict-key">${escapeHtml(key)}</div>
                <div class="conflict-values">
                  ${allValues.map(v => `
                    <div class="conflict-value ${v.isWinner ? 'winner' : ''}">
                      <span class="source-color-dot" style="background-color: ${v.color}"></span>
                      <span class="conflict-source">${escapeHtml(v.callName)}:</span>
                      <span class="conflict-val">${formatValue(v.value)}</span>
                      ${v.isWinner ? '<span class="winner-badge">✓</span>' : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Helper to flatten an object into dotted paths
  function flattenObject(obj, prefix = '') {
    const result = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, fullPath));
      } else {
        result[fullPath] = value;
      }
    }
    return result;
  }

  // Organize properties by source: common vs source-specific
  const commonProps = {};
  const sourceSpecificProps = {}; // sourceName -> { key: value }
  const COMMON_COLOR = '#8b949e';

  // Flatten entityData to handle nested properties with paths like "address.city"
  const flattenedData = flattenObject(entityData);

  for (const [path, value] of Object.entries(flattenedData)) {
    // Skip arrays
    if (Array.isArray(value)) continue;

    const propSources = propertySources[path] || [];

    if (propSources.length > 1) {
      // Property exists in multiple sources -> common
      commonProps[path] = value;
    } else if (propSources.length === 1) {
      // Property exists in only one source -> source-specific
      const sourceName = propSources[0].callName;
      if (!sourceSpecificProps[sourceName]) {
        sourceSpecificProps[sourceName] = {};
      }
      sourceSpecificProps[sourceName][path] = value;
    } else {
      // No source tracked (shouldn't happen, but fallback to common)
      commonProps[path] = value;
    }
  }

  // Properties section with source grouping
  html += `
    <div class="node-detail-section">
      <h4>Properties</h4>
      <div class="merged-properties">
  `;

  // Common properties
  if (Object.keys(commonProps).length > 0) {
    html += `<div class="property-group-header" style="color: ${COMMON_COLOR}">common</div>`;
    for (const [key, value] of Object.entries(commonProps)) {
      html += `
        <div class="merged-property">
          <span class="property-key" style="color: ${COMMON_COLOR}">${escapeHtml(key)}:</span>
          <span class="property-value">${formatValue(value)}</span>
        </div>
      `;
    }
  }

  // Source-specific properties
  nodeSources.forEach((src, idx) => {
    const srcProps = sourceSpecificProps[src.callName];
    if (srcProps && Object.keys(srcProps).length > 0) {
      const srcColor = SOURCE_COLORS[idx % SOURCE_COLORS.length];
      html += `<div class="property-group-header" style="color: ${srcColor}">${escapeHtml(src.callName)}</div>`;
      for (const [key, value] of Object.entries(srcProps)) {
        html += `
          <div class="merged-property">
            <span class="property-key" style="color: ${srcColor}">${escapeHtml(key)}:</span>
            <span class="property-value">${formatValue(value)}</span>
          </div>
        `;
      }
    }
  });

  html += `
      </div>
    </div>
  `;

  // Entity configuration section
  html += `
    <div class="node-detail-section">
      <h4>Entity Configuration</h4>
      <div class="sidebar-entity-config">
        <div class="config-row">
          <label>Label</label>
          <input type="text" id="sidebar-entity-label" value="${escapeHtml(entityLabel)}" placeholder="Display name">
        </div>
        <div class="config-row">
          <label>Display Field</label>
          <select id="sidebar-display-field-select" class="entity-select">
            ${availableFields.map(field => `
              <option value="${escapeHtml(field)}" ${currentDisplayField === field ? 'selected' : ''}>
                ${escapeHtml(field)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    </div>
  `;

  // Extraction sources section (for managing sources at entity type level)
  html += `
    <div class="node-detail-section">
      <h4>Extraction Sources (${extractionSources.length})</h4>
      <div class="sidebar-sources-list">
        ${extractionSources.map(src => `
          <div class="sidebar-source-row" data-call-id="${src.callId}" data-index="${src.index}">
            <span class="source-call">${escapeHtml(src.callName)}</span>
            <span class="source-path">${escapeHtml(src.path)}</span>
            <button class="btn-remove-source" title="Remove">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="sidebar-add-source">
        <select id="sidebar-add-source-call">
          ${calls.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <input type="text" id="sidebar-add-source-path" placeholder="$.path[*]" value="$">
        <button class="btn btn-small" id="sidebar-btn-add-source">+</button>
      </div>
    </div>
  `;

  // Parents section
  if (parents.length > 0) {
    html += `
      <div class="node-detail-section">
        <h4>Parents (${parents.length})</h4>
        ${parents.map(p => `
          <div class="relation-link" data-node-id="${p.nodeId}" style="border-left: 3px solid ${p.color}">
            <strong>${escapeHtml(p.label)}</strong>: ${escapeHtml(p.displayValue)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Children section
  if (children.length > 0) {
    html += `
      <div class="node-detail-section">
        <h4>Children (${children.length})</h4>
        ${children.map(c => `
          <div class="relation-link" data-node-id="${c.nodeId}" style="border-left: 3px solid ${c.color}">
            <strong>${escapeHtml(c.label)}</strong>: ${escapeHtml(c.displayValue)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Build structured data by source
  const structuredData = {};

  // Add common properties
  if (Object.keys(commonProps).length > 0) {
    structuredData.common = commonProps;
  }

  // Add source-specific properties
  nodeSources.forEach((src) => {
    const srcProps = sourceSpecificProps[src.callName];
    if (srcProps && Object.keys(srcProps).length > 0) {
      structuredData[src.callName] = srcProps;
    }
  });

  // Add conflicts summary if any
  if (conflictKeys.length > 0) {
    structuredData._conflicts = {};
    for (const key of conflictKeys) {
      const propSources = propertySources[key] || [];
      structuredData._conflicts[key] = propSources.map(s => ({
        source: s.callName,
        value: s.value,
      }));
    }
  }

  // Data section with structured JSON
  html += `
    <div class="node-detail-section">
      <h4>Data</h4>
      <div class="node-detail-json">
        <pre class="code-block">${escapeHtml(JSON.stringify(structuredData, null, 2))}</pre>
      </div>
      <button class="btn btn-small" id="btn-copy-entity-json">Copy JSON</button>
    </div>
  `;

  detailsEl.innerHTML = html;

  // Entity label handler
  const labelInput = document.getElementById('sidebar-entity-label');
  if (labelInput && entityType) {
    labelInput.addEventListener('change', () => {
      mappingStore.setEntity(entityType, { label: labelInput.value.trim() });
    });
  }

  // Display field handler
  const displayFieldSelect = document.getElementById('sidebar-display-field-select');
  if (displayFieldSelect && entityType) {
    displayFieldSelect.addEventListener('change', () => {
      mappingStore.setEntity(entityType, { displayField: displayFieldSelect.value });
    });
  }

  // Remove source handlers
  detailsEl.querySelectorAll('.btn-remove-source').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.sidebar-source-row');
      const srcCallId = row.dataset.callId;
      const index = parseInt(row.dataset.index, 10);

      const call = callsStore.getCall(srcCallId);
      if (call) {
        const extractions = [...(call.extractions || [])];
        extractions.splice(index, 1);
        callsStore.updateExtractions(srcCallId, extractions);
      }
    });
  });

  // Add source handler
  const addSourceBtn = document.getElementById('sidebar-btn-add-source');
  if (addSourceBtn && entityType) {
    addSourceBtn.addEventListener('click', () => {
      const callSelect = document.getElementById('sidebar-add-source-call');
      const pathInput = document.getElementById('sidebar-add-source-path');
      const srcCallId = callSelect.value;
      const srcPath = pathInput.value.trim();

      if (srcCallId && srcPath) {
        const call = callsStore.getCall(srcCallId);
        if (call) {
          const extractions = [...(call.extractions || [])];
          extractions.push({ entity: entityType, path: srcPath });
          callsStore.updateExtractions(srcCallId, extractions);
          pathInput.value = '$';
        }
      }
    });
  }

  // Add click handlers for relation links
  detailsEl.querySelectorAll('.relation-link').forEach(link => {
    link.addEventListener('click', () => {
      const nodeId = link.dataset.nodeId;
      if (callbacks.onNodeNavigate) {
        callbacks.onNodeNavigate(nodeId);
      }
    });
  });

  // Copy handler
  const copyBtn = document.getElementById('btn-copy-entity-json');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(JSON.stringify(structuredData, null, 2), copyBtn));
  }

  showSidebar();
}

/**
 * Show the sidebar
 */
export function showSidebar() {
  if (panelEl) {
    panelEl.classList.remove('collapsed');
    const resizeHandle = document.getElementById('resize-handle-right');
    if (resizeHandle) {
      resizeHandle.classList.remove('hidden');
    }
  }
}

/**
 * Hide the sidebar
 */
export function hideSidebar() {
  if (panelEl) {
    panelEl.classList.add('collapsed');
    const resizeHandle = document.getElementById('resize-handle-right');
    if (resizeHandle) {
      resizeHandle.classList.add('hidden');
    }
  }

  if (callbacks.onClose) {
    callbacks.onClose();
  }
}

/**
 * Check if sidebar is visible
 */
export function isSidebarVisible() {
  return panelEl && !panelEl.classList.contains('collapsed');
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null) return '<span style="color: #8b949e">null</span>';
  if (value === undefined) return '<span style="color: #8b949e">undefined</span>';

  const type = typeof value;

  if (type === 'string') {
    if (value.length > 50) {
      return `"${escapeHtml(value.substring(0, 47))}..."`;
    }
    return `"${escapeHtml(value)}"`;
  }

  if (type === 'number') {
    return `<span style="color: #79c0ff">${value}</span>`;
  }

  if (type === 'boolean') {
    return `<span style="color: #ff7b72">${value}</span>`;
  }

  return escapeHtml(String(value));
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  } catch (e) {
    console.error('Failed to copy:', e);
  }
}

/**
 * Convert dot notation path to JSONPath bracket notation
 * e.g., "$.0" -> "$[0]", "$.contacts.0" -> "$.contacts[0]"
 */
function toJsonPath(path) {
  if (!path) return path;
  // Replace .N (where N is a number) with [N]
  return path.replace(/\.(\d+)/g, '[$1]');
}

/**
 * Update the entity mapping for a node
 * @param {string} callId - The call ID
 * @param {string} path - The node path (dot notation)
 * @param {string} newEntityType - The new entity type (empty string to remove)
 */
function updateNodeEntityMapping(callId, path, newEntityType) {
  const call = callsStore.getCall(callId);
  if (!call) return;

  // Convert path to JSONPath format for extraction
  const jsonPath = toJsonPath(path);

  let extractions = [...(call.extractions || [])];

  // Find existing extraction for this path (check both formats)
  const existingIdx = extractions.findIndex(e => e.path === jsonPath || e.path === path);

  if (newEntityType) {
    // Add or update extraction
    if (existingIdx >= 0) {
      extractions[existingIdx] = { ...extractions[existingIdx], entity: newEntityType, path: jsonPath };
    } else {
      extractions.push({ entity: newEntityType, path: jsonPath });
    }
  } else {
    // Remove extraction
    if (existingIdx >= 0) {
      extractions.splice(existingIdx, 1);
    }
  }

  callsStore.updateExtractions(callId, extractions);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
