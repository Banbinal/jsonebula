/**
 * Explorer Toolbar
 *
 * Toolbar with Add JSON, Clear All buttons, and stats display.
 */

let addJsonBtn = null;
let clearAllBtn = null;
let statsDisplay = null;
let callbacks = {};

/**
 * Initialize the toolbar
 * @param {Object} options - Callbacks
 * @param {Function} options.onAddJson - Called when Add JSON clicked
 * @param {Function} options.onClearAll - Called when Clear All clicked
 */
export function initToolbar(options = {}) {
  callbacks = options;

  addJsonBtn = document.getElementById('btn-add-json');
  clearAllBtn = document.getElementById('btn-clear-all');
  statsDisplay = document.getElementById('stats-display');

  if (addJsonBtn) {
    addJsonBtn.addEventListener('click', () => {
      if (callbacks.onAddJson) {
        callbacks.onAddJson();
      }
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Clear all loaded data?')) {
        if (callbacks.onClearAll) {
          callbacks.onClearAll();
        }
      }
    });
  }

  // Initialize stats
  updateStats(0, 0);
}

/**
 * Update stats display
 * @param {number} nodeCount - Number of nodes
 * @param {number} edgeCount - Number of edges
 */
export function updateStats(nodeCount, edgeCount) {
  if (statsDisplay) {
    statsDisplay.textContent = `${nodeCount} node${nodeCount !== 1 ? 's' : ''}, ${edgeCount} edge${edgeCount !== 1 ? 's' : ''}`;
  }
}
