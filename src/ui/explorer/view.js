/**
 * Explorer View
 *
 * Main orchestrator for the Explorer view.
 * Coordinates graph rendering, navigation, filtering, and detail sidebar.
 */

import { configStore } from '../../config/store.js';
import { dataStore } from '../../data/store.js';
import { graphStore } from '../../graph/store.js';
import { createGraphRenderer } from '../../graph/renderer.js';
import { getHighlightSets, getRelationSummary } from '../../graph/navigate.js';
import { initJsonInputModal, openJsonInputModal } from './json-input.js';
import { initToolbar, updateStats } from './toolbar.js';
import { initSidebar, showNodeDetails, hideSidebar } from './sidebar.js';

let renderer = null;
let initialized = false;

/**
 * Initialize the Explorer view
 */
export function initExplorerView() {
  if (initialized) {
    console.warn('Explorer view already initialized');
    return;
  }

  // Initialize JSON input modal
  initJsonInputModal();

  // Initialize toolbar
  initToolbar({
    onAddJson: () => openJsonInputModal({
      onSuccess: () => rebuildGraph(),
    }),
    onClearAll: handleClearAll,
  });

  // Initialize sidebar
  initSidebar({
    onNodeSelect: handleNodeSelect,
  });

  // Initialize graph renderer
  const graphContainer = document.getElementById('explorer-graph');
  if (graphContainer) {
    renderer = createGraphRenderer();
    renderer.init(graphContainer);

    // Set up node interactions
    renderer.onNodeClick(handleNodeClick);
    renderer.onNodeDoubleClick(handleNodeDoubleClick);
  }

  // Listen for data changes
  dataStore.onChange(() => {
    rebuildGraph();
  });

  // Listen for config changes (might affect display fields, colors)
  configStore.onChange(() => {
    rebuildGraph();
  });

  initialized = true;

  // Initial render (in case data was loaded before initialization)
  rebuildGraph();
}

/**
 * Rebuild graph from current data
 */
function rebuildGraph() {
  // Build graph store from data
  graphStore.buildFromData();

  // Render to Cytoscape
  if (renderer) {
    const nodes = graphStore.getNodes();
    const edges = graphStore.getEdges();
    renderer.render(nodes, edges);
  }

  // Update stats
  updateStats(graphStore.getNodeCount(), graphStore.getEdgeCount());
}

/**
 * Handle node click (select and show details)
 * @param {string} nodeId - Node ID
 * @param {Object} nodeData - Cytoscape node data
 */
function handleNodeClick(nodeId, nodeData) {
  // Select in graph
  if (renderer) {
    renderer.selectNode(nodeId);
  }

  // Get full node data from store
  const node = graphStore.getNode(nodeId);
  if (!node) return;

  // Get relation summary
  const relations = getRelationSummary(nodeId);

  // Show in sidebar
  showNodeDetails({
    nodeId,
    type: node.type,
    data: node.data,
    parents: relations.parents,
    children: relations.children,
  });
}

/**
 * Handle node double-click (highlight relations)
 * @param {string} nodeId - Node ID
 */
function handleNodeDoubleClick(nodeId) {
  if (!renderer) return;

  // Get highlight sets
  const { highlight, dim } = getHighlightSets(nodeId);

  // Apply styles
  renderer.resetStyles();
  renderer.highlightNodes(highlight);
  renderer.dimNodes(dim);
}

/**
 * Handle node selection from sidebar
 * @param {string} nodeId - Node ID
 */
function handleNodeSelect(nodeId) {
  handleNodeClick(nodeId, {});

  if (renderer) {
    renderer.centerOnNode(nodeId);
  }
}

/**
 * Handle clear all action
 */
function handleClearAll() {
  dataStore.clearAll();
  hideSidebar();

  if (renderer) {
    renderer.resetStyles();
  }
}

/**
 * Called when switching to Explorer view
 */
export function onExplorerViewActivate() {
  // Resize graph
  if (renderer) {
    setTimeout(() => {
      renderer.resize();
    }, 100);
  }
}

/**
 * Reset graph styles (for query clear)
 */
export function resetGraphStyles() {
  if (renderer) {
    renderer.resetStyles();
  }
}

/**
 * Highlight nodes matching a condition
 * @param {Array<string>} matchingIds - Node IDs to highlight
 */
export function highlightMatching(matchingIds) {
  if (!renderer) return;

  const allIds = renderer.getNodeIds();
  const matchSet = new Set(matchingIds);
  const dimIds = allIds.filter(id => !matchSet.has(id));

  renderer.resetStyles();
  renderer.highlightNodes(matchingIds);
  renderer.dimNodes(dimIds);
}

/**
 * Get renderer instance (for external use)
 */
export function getRenderer() {
  return renderer;
}
