/**
 * Relations List UI V4
 *
 * Displays and manages the list of FK relations.
 * V4 format: { from, to, toFk, fromPk? }
 * - from: Parent entity ID
 * - to: Child entity ID
 * - toFk: FK field path in child entity (e.g., "client_id" or "meta.parentId")
 * - fromPk: Optional PK field path in parent (defaults to entity's pk config)
 */

import { configStore } from '../../config/store.js';

let containerEl = null;
let addButtonEl = null;

/**
 * Initialize the relations list
 */
export function initRelationsList() {
  containerEl = document.getElementById('relation-list');
  addButtonEl = document.getElementById('btn-add-relation');

  if (!containerEl || !addButtonEl) {
    console.error('Relations List: Missing DOM elements');
    return;
  }

  // Add button handler
  addButtonEl.addEventListener('click', handleAddRelation);

  // Listen for config changes
  configStore.onChange(() => {
    render();
  });

  // Initial render
  render();
}

/**
 * Handle adding a new relation
 */
function handleAddRelation() {
  const entityIds = configStore.getEntityIds();

  if (entityIds.length < 2) {
    alert('Please create at least two entities first');
    return;
  }

  // Create a default relation with first two entities
  const from = entityIds[0];
  const to = entityIds[1];

  configStore.addRelation(from, to, `${from}_id`);
}

/**
 * Render the relations list
 */
function render() {
  const relations = configStore.getRelations();
  const entityIds = configStore.getEntityIds();

  containerEl.innerHTML = '';

  if (relations.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">
        <p>No FK relations defined</p>
        <p style="margin-top: 0.5rem;">Intra-call relations are automatic from nested JSON structure</p>
      </div>
    `;
    return;
  }

  relations.forEach((relation, index) => {
    const row = createRelationRow(relation, index, entityIds);
    containerEl.appendChild(row);
  });
}

/**
 * Create a relation row element (V4 format)
 * @param {Object} relation - Relation data { from, to, toFk, fromPk? }
 * @param {number} index - Relation index
 * @param {Array<string>} entityIds - Available entity ids
 * @returns {HTMLElement}
 */
function createRelationRow(relation, index, entityIds) {
  const row = document.createElement('div');
  row.className = 'relation-row-v4';
  row.dataset.index = index;

  // Get entity info for display
  const fromEntity = configStore.getEntity(relation.from);
  const toEntity = configStore.getEntity(relation.to);
  const fromLabel = fromEntity?.label || relation.from;
  const toLabel = toEntity?.label || relation.to;
  const fromPkDefault = fromEntity?.pk || 'id';

  // Tooltip explaining the relationship
  const tooltip = `${toLabel}.${relation.toFk} → ${fromLabel}.${relation.fromPk || fromPkDefault}`;

  row.innerHTML = `
    <div class="relation-field-group">
      <span class="field-label">Parent</span>
      <select data-field="from" title="Parent entity (one side)">
        ${entityIds.map(id => {
          const entity = configStore.getEntity(id);
          const selected = id === relation.from ? 'selected' : '';
          return `<option value="${id}" ${selected}>${escapeHtml(entity?.label || id)}</option>`;
        }).join('')}
      </select>
    </div>
    <span class="relation-arrow" title="${escapeHtml(tooltip)}">←</span>
    <div class="relation-field-group">
      <span class="field-label">Child</span>
      <select data-field="to" title="Child entity (many side)">
        ${entityIds.map(id => {
          const entity = configStore.getEntity(id);
          const selected = id === relation.to ? 'selected' : '';
          return `<option value="${id}" ${selected}>${escapeHtml(entity?.label || id)}</option>`;
        }).join('')}
      </select>
    </div>
    <span class="relation-arrow">.</span>
    <div class="relation-field-group">
      <span class="field-label">FK Field</span>
      <input type="text" data-field="toFk" value="${escapeHtml(relation.toFk)}" placeholder="parent_id" title="FK field path in child entity">
    </div>
    <button class="btn btn-icon btn-delete" title="Delete relation">&times;</button>
  `;

  // From select
  row.querySelector('select[data-field="from"]').addEventListener('change', (e) => {
    configStore.updateRelation(index, { from: e.target.value });
  });

  // To select
  row.querySelector('select[data-field="to"]').addEventListener('change', (e) => {
    configStore.updateRelation(index, { to: e.target.value });
  });

  // toFk input
  const toFkInput = row.querySelector('input[data-field="toFk"]');
  toFkInput.addEventListener('change', () => {
    const value = toFkInput.value.trim();
    if (value) {
      configStore.updateRelation(index, { toFk: value });
    } else {
      toFkInput.value = relation.toFk; // Revert if empty
    }
  });
  toFkInput.addEventListener('blur', () => {
    toFkInput.dispatchEvent(new Event('change'));
  });

  // Delete button
  row.querySelector('.btn-delete').addEventListener('click', () => {
    configStore.deleteRelation(index);
  });

  return row;
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
