/**
 * Entity List UI
 *
 * Displays and manages the list of entities with CRUD operations.
 * Supports color picker and bidirectional binding with configStore.
 */

import { configStore } from '../../config/store.js';

let containerEl = null;
let addButtonEl = null;
let colorPickerEl = null;
let activeColorPicker = null;

/**
 * Initialize the entity list
 */
export function initEntityList() {
  containerEl = document.getElementById('entity-list');
  addButtonEl = document.getElementById('btn-add-entity');

  if (!containerEl || !addButtonEl) {
    console.error('Entity List: Missing DOM elements');
    return;
  }

  // Create color picker (shared, positioned absolutely)
  createColorPicker();

  // Add button handler
  addButtonEl.addEventListener('click', handleAddEntity);

  // Listen for config changes
  configStore.onChange(() => {
    render();
  });

  // Close color picker on outside click
  document.addEventListener('click', (e) => {
    if (colorPickerEl && !colorPickerEl.contains(e.target) &&
        !e.target.classList.contains('entity-color')) {
      closeColorPicker();
    }
  });

  // Initial render
  render();
}

/**
 * Create the shared color picker element
 */
function createColorPicker() {
  colorPickerEl = document.createElement('div');
  colorPickerEl.className = 'color-picker';

  const colors = configStore.getColors();
  colors.forEach(color => {
    const option = document.createElement('div');
    option.className = 'color-option';
    option.style.backgroundColor = color;
    option.dataset.color = color;
    option.addEventListener('click', () => handleColorSelect(color));
    colorPickerEl.appendChild(option);
  });

  document.body.appendChild(colorPickerEl);
}

/**
 * Handle adding a new entity
 */
function handleAddEntity() {
  const entityIds = configStore.getEntityIds();
  let newId = 'entity';
  let counter = 1;

  // Generate unique id
  while (entityIds.includes(newId)) {
    newId = `entity${counter++}`;
  }

  configStore.addEntity(newId);
}

/**
 * Render the entity list
 */
function render() {
  const entityIds = configStore.getEntityIds();

  containerEl.innerHTML = '';

  if (entityIds.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <p>No entities defined</p>
        <p style="font-size: 0.75rem;">Click + to add your first entity</p>
      </div>
    `;
    return;
  }

  entityIds.forEach(id => {
    const entity = configStore.getEntity(id);
    const card = createEntityCard(id, entity);
    containerEl.appendChild(card);
  });
}

/**
 * Create an entity card element
 * @param {string} id - Entity id
 * @param {Object} entity - Entity data
 * @returns {HTMLElement}
 */
function createEntityCard(id, entity) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.dataset.entityId = id;

  card.innerHTML = `
    <div class="entity-card-header">
      <div class="entity-color" style="background-color: ${entity.color}" title="Click to change color"></div>
      <span class="entity-label">${entity.label}</span>
      <button class="btn btn-icon btn-delete" title="Delete entity">&times;</button>
    </div>
    <div class="entity-card-body">
      <div class="entity-field">
        <label>Key</label>
        <input type="text" data-field="key" value="${escapeHtml(id)}" placeholder="entity_key">
      </div>
      <div class="entity-field">
        <label>Label</label>
        <input type="text" data-field="label" value="${escapeHtml(entity.label)}" placeholder="Display Name">
      </div>
      <div class="entity-field">
        <label>PK</label>
        <input type="text" data-field="pk" value="${escapeHtml(entity.pk)}" placeholder="id">
      </div>
      <div class="entity-field">
        <label>Display</label>
        <input type="text" data-field="displayField" value="${escapeHtml(entity.displayField)}" placeholder="name or address.city" title="Supports dot notation (e.g., address.city)">
      </div>
    </div>
  `;

  // Color picker
  const colorEl = card.querySelector('.entity-color');
  colorEl.addEventListener('click', (e) => {
    e.stopPropagation();
    openColorPicker(colorEl, id);
  });

  // Delete button
  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => {
    if (confirm(`Delete entity "${entity.label}"?`)) {
      configStore.deleteEntity(id);
    }
  });

  // Field inputs
  card.querySelectorAll('input').forEach(input => {
    const field = input.dataset.field;

    input.addEventListener('change', () => {
      const value = input.value.trim();

      if (field === 'key') {
        // Rename entity
        if (value && value !== id) {
          const success = configStore.renameEntity(id, value);
          if (!success) {
            input.value = id; // Revert on failure
          }
        } else if (!value) {
          input.value = id; // Revert if empty
        }
      } else {
        // Update field
        configStore.updateEntity(id, { [field]: value || entity[field] });
      }
    });

    // Update on blur too for better UX
    input.addEventListener('blur', () => {
      input.dispatchEvent(new Event('change'));
    });
  });

  return card;
}

/**
 * Open color picker near an element
 * @param {HTMLElement} targetEl - Element to position near
 * @param {string} entityId - Entity id
 */
function openColorPicker(targetEl, entityId) {
  const rect = targetEl.getBoundingClientRect();

  colorPickerEl.style.top = `${rect.bottom + 4}px`;
  colorPickerEl.style.left = `${rect.left}px`;
  colorPickerEl.classList.add('open');

  activeColorPicker = entityId;

  // Highlight current color
  const entity = configStore.getEntity(entityId);
  colorPickerEl.querySelectorAll('.color-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.color === entity.color);
  });
}

/**
 * Close color picker
 */
function closeColorPicker() {
  colorPickerEl.classList.remove('open');
  activeColorPicker = null;
}

/**
 * Handle color selection
 * @param {string} color - Selected color
 */
function handleColorSelect(color) {
  if (activeColorPicker) {
    configStore.updateEntity(activeColorPicker, { color });
    closeColorPicker();
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
