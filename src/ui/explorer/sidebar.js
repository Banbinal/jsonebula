/**
 * Node Detail Sidebar
 *
 * Shows details of a selected node including JSON data and related nodes.
 */

import { configStore } from '../../config/store.js';
import { evaluatePathSingle } from '../../path/parser.js';

let sidebarEl = null;
let detailsEl = null;
let closeBtn = null;
let callbacks = {};

/**
 * Initialize the sidebar
 * @param {Object} options - Callbacks
 * @param {Function} options.onNodeSelect - Called when a related node is clicked
 */
export function initSidebar(options = {}) {
  callbacks = options;

  sidebarEl = document.getElementById('panel-sidebar');
  detailsEl = document.getElementById('node-details');
  closeBtn = document.getElementById('btn-close-sidebar');

  if (closeBtn) {
    closeBtn.addEventListener('click', hideSidebar);
  }
}

/**
 * Show node details in sidebar
 * @param {Object} node - Node info
 * @param {string} node.nodeId - Node ID
 * @param {string} node.type - Entity type
 * @param {Object} node.data - Node data
 * @param {Array} node.parents - Parent relations
 * @param {Array} node.children - Child relations
 */
export function showNodeDetails(node) {
  if (!sidebarEl || !detailsEl) return;

  const entityConfig = configStore.getEntity(node.type);
  const color = entityConfig?.color || '#4F46E5';
  const label = entityConfig?.label || node.type;
  const displayField = entityConfig?.displayField || 'id';
  const displayValue = evaluatePathSingle(node.data, displayField) || node.nodeId;

  // Build HTML
  let html = `
    <div class="node-detail-badge" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}">
      ${escapeHtml(label)}
    </div>
    <div class="node-detail-title">${escapeHtml(String(displayValue))}</div>
  `;

  // Parents section
  if (node.parents && node.parents.length > 0) {
    html += `
      <div class="node-detail-section">
        <h4>Parents (${node.parents.length})</h4>
        ${node.parents.map(p => `
          <div class="relation-link" data-node-id="${p.nodeId}" style="border-left: 3px solid ${p.color}">
            <strong>${escapeHtml(p.label)}</strong>: ${escapeHtml(p.displayValue)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Children section
  if (node.children && node.children.length > 0) {
    html += `
      <div class="node-detail-section">
        <h4>Children (${node.children.length})</h4>
        ${node.children.map(c => `
          <div class="relation-link" data-node-id="${c.nodeId}" style="border-left: 3px solid ${c.color}">
            <strong>${escapeHtml(c.label)}</strong>: ${escapeHtml(c.displayValue)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // JSON section
  html += `
    <div class="node-detail-section">
      <h4>Data</h4>
      <div class="node-detail-json">
        <pre class="code-block">${escapeHtml(JSON.stringify(node.data, null, 2))}</pre>
      </div>
      <button class="btn btn-small" style="margin-top: 8px" id="btn-copy-node-json">Copy JSON</button>
    </div>
  `;

  detailsEl.innerHTML = html;

  // Add click handlers for relation links
  detailsEl.querySelectorAll('.relation-link').forEach(link => {
    link.addEventListener('click', () => {
      const nodeId = link.dataset.nodeId;
      if (callbacks.onNodeSelect) {
        callbacks.onNodeSelect(nodeId);
      }
    });
  });

  // Copy JSON button
  const copyBtn = document.getElementById('btn-copy-node-json');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(node.data, null, 2));
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy JSON';
        }, 1500);
      } catch (e) {
        console.error('Failed to copy:', e);
      }
    });
  }

  // Show sidebar
  sidebarEl.classList.remove('collapsed');
}

/**
 * Hide the sidebar
 */
export function hideSidebar() {
  if (sidebarEl) {
    sidebarEl.classList.add('collapsed');
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
