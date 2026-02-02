/**
 * Navigation
 *
 * Handles tab switching between Mapping and Explorer views.
 */

let currentView = 'mapping';
let onViewChangeCallbacks = [];

/**
 * Initialize navigation
 * @param {Object} options - View activate callbacks
 * @param {Function} options.onMappingActivate - Called when Mapping view activates
 * @param {Function} options.onExplorerActivate - Called when Explorer view activates
 */
export function initNavigation(options = {}) {
  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');

  if (options.onMappingActivate) {
    onViewChangeCallbacks.push({ view: 'mapping', callback: options.onMappingActivate });
  }
  if (options.onExplorerActivate) {
    onViewChangeCallbacks.push({ view: 'explorer', callback: options.onExplorerActivate });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const viewId = tab.dataset.view;

      if (viewId === currentView) return;

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active view
      views.forEach(v => v.classList.remove('active'));
      const viewEl = document.getElementById(`view-${viewId}`);
      if (viewEl) {
        viewEl.classList.add('active');
      }

      currentView = viewId;

      // Trigger resize for Cytoscape instances
      window.dispatchEvent(new Event('resize'));

      // Call view-specific callbacks
      onViewChangeCallbacks
        .filter(c => c.view === viewId)
        .forEach(c => {
          try {
            c.callback();
          } catch (e) {
            console.error(`Error in ${viewId} activate callback:`, e);
          }
        });
    });
  });
}

/**
 * Get current view
 * @returns {string} 'mapping' or 'explorer'
 */
export function getCurrentView() {
  return currentView;
}

/**
 * Switch to a specific view programmatically
 * @param {string} viewId - 'mapping' or 'explorer'
 */
export function switchToView(viewId) {
  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  if (tab) {
    tab.click();
  }
}
