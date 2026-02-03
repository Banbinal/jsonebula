/**
 * json-nebula - Main Application Entry Point
 *
 * Data-first JSON exploration tool.
 * Paste JSON → See graph → Mapped entities highlighted inline
 */

// Stores
import { callsStore } from './calls/store.js';
import { mappingStore } from './mapping/store.js';

// Graph
import { createGraphRenderer } from './graph/renderer.js';
import { mergeCallGraphs } from './graph/raw.js';
import { evaluatePath } from './path/parser.js';

// UI Components
import { initCallsTabs } from './ui/calls/tabs.js';
import { initJsonEditor, refreshEditor } from './ui/calls/editor.js';
import { initSidebar, showRawNodeDetails, showMappedNodeDetails, hideSidebar } from './ui/sidebar.js';
import { initMappingPanel, openMappingPanel } from './ui/mapping/panel.js';

// Query
import {
  applyQueryHighlight,
  clearQueryHighlight,
  getQueryHelp,
  extractAutocompleteData,
  applyQuickFilter,
  filterByEntityType
} from './core/query.js';

// Example data
import { petstoreConfig, petstoreData } from './examples/petstore.js';

// Onboarding
import { hasCompletedOnboarding, startOnboarding } from './ui/onboarding.js';

let renderer = null;
let graphEmptyEl = null;
let graphStatsEl = null;
let hideUnmapped = false;

// Focus mode state
let focusMode = false;
let focusNodeId = null;
let focusDepth = 2;

// Hidden entity types
let hiddenTypes = new Set();

// Active call filter (null = show all)
let activeCallFilter = null;

// Collapsed nodes state (node IDs that are collapsed)
let collapsedNodes = new Set();

// Auto-collapse thresholds
const AUTO_COLLAPSE_TOTAL_THRESHOLD = 1000;  // Only auto-collapse if total nodes > this
const AUTO_COLLAPSE_NODE_THRESHOLD = 50;     // Collapse nodes with more than this many successors

// Path finder state
let pathFromNode = null;
let pathToNode = null;

/**
 * Show a styled confirm dialog (replaces native confirm())
 * @param {string} title - Modal title
 * @param {string} message - Message body
 * @returns {Promise<boolean>} true if confirmed
 */
function showConfirm(title, message) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    const backdrop = modal.querySelector('.modal-backdrop');
    const closeBtn = modal.querySelector('.modal-close:not(#confirm-cancel)');

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.add('open');

    function close(result) {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      closeBtn?.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { close(true); }
    function onCancel() { close(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    closeBtn?.addEventListener('click', onCancel);
  });
}

/**
 * Initialize the application
 */
function init() {
  // Verify Cytoscape is loaded
  if (typeof cytoscape === 'undefined') {
    console.error('Cytoscape.js not loaded!');
    showError('Failed to load Cytoscape.js. Please check your internet connection.');
    return;
  }

  // Get DOM elements
  graphEmptyEl = document.getElementById('graph-empty');
  graphStatsEl = document.getElementById('graph-stats');

  // Initialize stores
  callsStore.init();
  mappingStore.init();

  // Initialize UI components
  initCallsTabs({
    onCallSelect: handleCallSelect,
  });

  initMappingPanel({
    onApply: handleMappingApply,
  });

  initJsonEditor({
    onJsonChange: handleJsonChange,
  });

  initSidebar({
    onNodeNavigate: handleNodeNavigate,
    onClose: handleSidebarClose,
  });

  // Initialize graph renderer
  const graphContainer = document.getElementById('graph-container');
  if (graphContainer) {
    renderer = createGraphRenderer();
    renderer.init(graphContainer);
    renderer.onNodeClick(handleNodeClick);
    renderer.onNodeDoubleClick(handleNodeDoubleClick);
  }

  // Initialize header buttons
  initHeaderButtons();

  // Initialize graph toolbar
  initGraphToolbar();

  // Initialize context menu
  initContextMenu();

  // Initialize focus mode controls
  initFocusControls();

  // Initialize hidden panel
  initHiddenPanel();

  // Initialize path finder
  initPathFinder();

  // Initialize left panel collapse
  initLeftPanelCollapse();

  // Listen for store changes - only rebuild for data changes, not navigation
  callsStore.onChange((state, eventType) => {
    // Skip rebuild for navigation events
    if (eventType === 'activeChanged') {
      return;
    }
    // For name updates, just update the compound node label
    if (eventType === 'nameUpdated') {
      updateCompoundNodeLabels();
      return;
    }
    debouncedRebuildGraph();
  });

  mappingStore.onChange(() => {
    debouncedRebuildGraph();
  });

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  // Load example by default if no data exists
  const hasExistingData = callsStore.getCallCount() > 1 ||
    (callsStore.getCallCount() === 1 && callsStore.getActiveCall()?.json?.trim());
  if (!hasExistingData) {
    loadExample();
    // Auto-trigger onboarding on first visit
    if (!hasCompletedOnboarding()) {
      setTimeout(() => startOnboarding(), 500);
    }
    return;
  }

  // Initial graph render
  rebuildGraph();
}

/**
 * Update compound node labels without rebuilding the graph
 */
function updateCompoundNodeLabels() {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  const calls = callsStore.getAllCalls();
  for (const call of calls) {
    const compoundNode = cy.getElementById(`compound-${call.id}`);
    if (compoundNode.length) {
      const idParts = call.id.split('-');
      const shortId = idParts[idParts.length - 1] || call.id.slice(-8);
      const newLabel = `${call.name} (${shortId})`;
      compoundNode.data('label', newLabel);
    }
  }
}

// Debounce timer for graph rebuilds
let rebuildDebounceTimer = null;

/**
 * Debounced graph rebuild - coalesces rapid changes into single rebuild
 */
function debouncedRebuildGraph() {
  clearTimeout(rebuildDebounceTimer);
  rebuildDebounceTimer = setTimeout(() => {
    rebuildGraph();
  }, 100);
}

/**
 * Rebuild the graph from all calls
 */
function rebuildGraph() {
  const calls = callsStore.getAllCalls();

  // Collect all calls with valid JSON
  const validCalls = calls
    .filter(call => call.parsedJson !== null)
    .map(call => ({
      callId: call.id,
      json: call.parsedJson,
    }));

  // Show/hide empty state
  if (validCalls.length === 0) {
    if (graphEmptyEl) graphEmptyEl.classList.remove('hidden');
    if (renderer) renderer.clear();
    updateStats(0, 0);
    return;
  }

  if (graphEmptyEl) graphEmptyEl.classList.add('hidden');

  // Get raw graph
  const { nodes, edges, truncated } = mergeCallGraphs(validCalls);

  if (truncated) {
    console.warn('Graph was truncated due to size limits');
  }

  // Compute entity mappings for nodes (with merging of same entity+PK)
  const { mappings, mergedNodes } = computeNodeMappings(calls, nodes);

  // Compute relation edges between mapped entities
  const relationEdges = computeRelationEdges(mappings);

  // Build callsInfo for compound node labels
  const callsInfo = {};
  for (const call of calls) {
    if (call.parsedJson !== null) {
      callsInfo[call.id] = { name: call.name };
    }
  }

  if (renderer) {
    renderer.render(nodes, edges, mappings, relationEdges, hideUnmapped, callsInfo, mergedNodes);
  }

  const cy = renderer?.getCy();

  // Reapply manually collapsed nodes
  reapplyCollapsedState();

  // Apply auto-collapse for large graphs (only if no manual collapse yet)
  if (nodes.length > AUTO_COLLAPSE_TOTAL_THRESHOLD && collapsedNodes.size === 0) {
    applyAutoCollapse();
  }

  // Count visible nodes/edges for stats
  const visibleNodes = cy ? cy.nodes(':visible').length : nodes.length;
  const visibleEdges = cy ? cy.edges(':visible').length : edges.length;
  updateStats(visibleNodes, visibleEdges);

  // Update collapse controls
  updateCollapseControls();

  // Update legend
  updateLegend();

  // Update call filters
  updateCallFilters();

  // Clear hidden types when graph rebuilds
  hiddenTypes.clear();
  updateHiddenPanel();

  // Clear path finder when graph rebuilds
  clearPathFinder();

  // Reapply active query if any
  const queryInput = document.getElementById('query-input');
  if (queryInput && queryInput.value.trim()) {
    applyQuery(queryInput.value);
  }
}

/**
 * Get a nested value from an object using a dotted path
 * e.g., getNestedValue(obj, "version.name") returns obj.version.name
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Resolve PK value from an object, supporting composite keys with "+" separator.
 * e.g., resolvePkValue(obj, "type+date") returns "order|2024-01-15"
 */
function resolvePkValue(obj, pkField) {
  if (!obj || !pkField) return undefined;

  if (!pkField.includes('+')) {
    return getNestedValue(obj, pkField);
  }

  const parts = pkField.split('+');
  const values = parts.map(p => getNestedValue(obj, p.trim()));

  if (values.some(v => v === undefined || v === null)) return undefined;

  return values.join('|');
}

/**
 * Deep merge objects with conflict detection and source tracking
 * @param {Object} target - Target object to merge into
 * @param {Object} source - Source object to merge from
 * @param {Object} sourceInfo - Info about source { callId, callName, sourceIndex }
 * @param {Object} conflicts - Accumulator for conflicts { path: [{ callId, callName, oldValue, newValue }] }
 * @param {Object} propertySources - Accumulator for property sources { path: [{ callId, callName, value, sourceIndex }] }
 * @param {string} path - Current path prefix (for nested properties)
 */
function deepMergeWithTracking(target, source, sourceInfo, conflicts, propertySources, path = '') {
  for (const [key, value] of Object.entries(source)) {
    const fullPath = path ? `${path}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Nested object -> recursive merge
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMergeWithTracking(target[key], value, sourceInfo, conflicts, propertySources, fullPath);
    } else {
      // Primitive or array -> detect conflict and track source
      if (target[key] !== undefined && target[key] !== value) {
        // Conflict detected - values differ
        if (!conflicts[fullPath]) {
          conflicts[fullPath] = [];
        }
        conflicts[fullPath].push({
          callId: sourceInfo.callId,
          callName: sourceInfo.callName,
          oldValue: target[key],
          newValue: value,
          sourceIndex: sourceInfo.sourceIndex,
        });
      }

      // Track property source
      if (!propertySources[fullPath]) {
        propertySources[fullPath] = [];
      }
      propertySources[fullPath].push({
        callId: sourceInfo.callId,
        callName: sourceInfo.callName,
        value,
        sourceIndex: sourceInfo.sourceIndex,
      });

      // Last source wins for the value
      target[key] = value;
    }
  }
}

/**
 * Compute which nodes are mapped to entities
 * Merges entities with the same type + PK into a single canonical node
 * @returns {{ mappings: Object, mergedNodes: Map }}
 *   - mappings: nodeId -> { entityType, entityLabel, color, data }
 *   - mergedNodes: Map of duplicateNodeId -> canonicalNodeId
 */
function computeNodeMappings(calls, nodes) {
  const mappings = {};
  const mergedNodes = new Map(); // duplicateNodeId -> canonicalNodeId
  const entities = mappingStore.getAllEntities();
  const entityMap = {};
  for (const e of entities) {
    entityMap[e.id] = e;
  }

  // First pass: collect all entities grouped by type + PK
  // Key: "entityType:pkValue", Value: array of { nodeId, data, entityConfig }
  const entityGroups = new Map();

  for (const call of calls) {
    if (!call.parsedJson || !call.extractions) {
      continue;
    }

    for (const extraction of call.extractions) {
      if (!extraction.entity || !extraction.path) {
        continue;
      }

      const entityConfig = entityMap[extraction.entity];
      if (!entityConfig) {
        continue;
      }

      const results = evaluatePath(call.parsedJson, extraction.path);

      for (const result of results) {
        if (!result.value || typeof result.value !== 'object') {
          continue;
        }

        const pathParts = result.path || [];
        const nodePath = ['$', ...pathParts].join('.');
        const nodeId = `${call.id}:${nodePath}`;

        // Handle arrays - they don't have PKs to merge on
        if (Array.isArray(result.value)) {
          const label = entityConfig.label || extraction.entity;

          mappings[nodeId] = {
            entityType: extraction.entity,
            entityLabel: `${label} (${result.value.length})`,
            color: entityConfig.color || '#4F46E5',
            data: result.value,
          };
          continue;
        }

        // Get PK value for grouping (supports composite keys with "+")
        const pkField = entityConfig.pk || 'id';
        const pkValue = resolvePkValue(result.value, pkField);

        if (pkValue !== undefined && pkValue !== null) {
          // Group by entityType + pkValue
          const groupKey = `${extraction.entity}:${pkValue}`;
          if (!entityGroups.has(groupKey)) {
            entityGroups.set(groupKey, []);
          }
          entityGroups.get(groupKey).push({
            nodeId,
            data: result.value,
            entityConfig,
            entityType: extraction.entity,
          });
        } else {
          // No PK, can't merge - create individual mapping
          const displayField = entityConfig.displayField || 'id';
          const displayValue = getNestedValue(result.value, displayField) || result.value.id || extraction.entity;

          mappings[nodeId] = {
            entityType: extraction.entity,
            entityLabel: String(displayValue),
            color: entityConfig.color || '#4F46E5',
            data: result.value,
          };
        }
      }
    }
  }

  // Second pass: process groups and merge duplicates
  for (const [groupKey, group] of entityGroups) {
    if (group.length === 0) continue;

    // First node is canonical
    const canonical = group[0];
    const entityConfig = canonical.entityConfig;
    const displayField = entityConfig.displayField || 'id';
    const displayValue = getNestedValue(canonical.data, displayField) || canonical.data.id || canonical.entityType;

    // Merge data from all sources with deep merge, conflict detection, and source tracking
    const mergedData = {};
    const propertySources = {}; // propertyPath -> [{ callId, callName, value, sourceIndex }]
    const conflicts = {}; // propertyPath -> [{ callId, callName, oldValue, newValue, sourceIndex }]
    const sources = []; // List of source info { callId, callName, nodeId }

    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const callId = item.nodeId.split(':')[0];
      const call = calls.find(c => c.id === callId);
      const callName = call?.name || callId;

      sources.push({ callId, callName, nodeId: item.nodeId, data: item.data });

      // Deep merge with tracking
      const sourceInfo = { callId, callName, sourceIndex: i };
      deepMergeWithTracking(mergedData, item.data, sourceInfo, conflicts, propertySources);

      // Track that duplicate nodeIds should redirect to canonical
      if (i > 0) {
        mergedNodes.set(item.nodeId, canonical.nodeId);
      }
    }

    const conflictCount = Object.keys(conflicts).length;

    mappings[canonical.nodeId] = {
      entityType: canonical.entityType,
      entityLabel: String(displayValue),
      color: entityConfig.color || '#4F46E5',
      data: mergedData,
      sources, // List of sources that contributed to this entity
      propertySources, // Which source each property came from
      conflicts, // Detected conflicts between sources
      sourceCount: group.length,
      hasConflicts: conflictCount > 0,
    };
  }

  return { mappings, mergedNodes };
}

/**
 * Compute relation edges between mapped entities
 */
function computeRelationEdges(mappings) {
  const edges = [];
  const relations = mappingStore.getRelations();
  const mappedNodes = Object.entries(mappings);

  // Build index by entity type
  const byType = {};
  for (const [nodeId, mapping] of mappedNodes) {
    if (!byType[mapping.entityType]) {
      byType[mapping.entityType] = [];
    }
    byType[mapping.entityType].push({ nodeId, ...mapping });
  }

  // For each relation, find matching pairs
  for (const relation of relations) {
    const fromNodes = byType[relation.from] || [];
    const toNodes = byType[relation.to] || [];

    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        // Node IDs format: callId:$.path.to.item
        const fromParts = fromNode.nodeId.split(':');
        const toParts = toNode.nodeId.split(':');
        const fromCallId = fromParts[0];
        const toCallId = toParts[0];
        const fromPath = fromParts.slice(1).join(':');
        const toPath = toParts.slice(1).join(':');

        // Same call - check if to is nested under from (structural relation)
        if (fromCallId === toCallId) {
          // To is child of from if to's path starts with from's path
          if (toPath.startsWith(fromPath + '.') && toPath !== fromPath) {
            edges.push({
              id: `rel-${fromNode.nodeId}-${toNode.nodeId}`,
              source: fromNode.nodeId,
              target: toNode.nodeId,
              edgeType: 'relation',
            });
          }
        }

        // FK matching (for inter-call relations)
        if (relation.toFk && toNode.data) {
          const fkValue = toNode.data[relation.toFk];
          const fromPk = relation.fromPk || mappingStore.getEntity(relation.from)?.pk || 'id';
          const fromPkValue = resolvePkValue(fromNode.data, fromPk);

          if (fkValue !== undefined && fkValue === fromPkValue) {
            const edgeId = `rel-fk-${fromNode.nodeId}-${toNode.nodeId}`;
            // Avoid duplicate
            if (!edges.find(e => e.id === edgeId)) {
              edges.push({
                id: edgeId,
                source: fromNode.nodeId,
                target: toNode.nodeId,
                edgeType: 'relation',
              });
            }
          }
        }
      }
    }
  }

  return edges;
}

/**
 * Update stats display
 */
function updateStats(nodeCount, edgeCount) {
  if (graphStatsEl) {
    graphStatsEl.innerHTML = `
      <span>${nodeCount} nodes</span>
      <span>${edgeCount} edges</span>
    `;
  }
}

/**
 * Apply auto-collapse for large graphs
 * Only collapses ARRAY nodes (lists) with many descendants
 */
function applyAutoCollapse() {
  if (!renderer) return;

  const cy = renderer.getCy();
  if (!cy) return;

  // Get only ARRAY nodes with many successors
  const arrayNodesWithSuccessors = [];
  cy.nodes('[nodeType="array"]').forEach(node => {
    const successorCount = node.successors('node').length;
    if (successorCount >= AUTO_COLLAPSE_NODE_THRESHOLD) {
      arrayNodesWithSuccessors.push({
        node,
        nodeId: node.id(),
        successorCount
      });
    }
  });

  // Sort by successor count (collapse biggest first)
  arrayNodesWithSuccessors.sort((a, b) => b.successorCount - a.successorCount);

  cy.startBatch();

  let visibleCount = cy.nodes(':visible').length;
  const targetCount = AUTO_COLLAPSE_TOTAL_THRESHOLD;

  // Collapse array nodes until we're under the threshold
  for (const { node, nodeId } of arrayNodesWithSuccessors) {
    if (visibleCount <= targetCount) break;

    // Skip if already hidden (child of an already collapsed node)
    if (!node.visible()) continue;

    // Collapse this array node
    collapsedNodes.add(nodeId);
    node.successors().hide();

    // Recalculate visible count
    visibleCount = cy.nodes(':visible').length;
  }

  cy.endBatch();
}

/**
 * Reapply collapsed state from stored collapsedNodes set
 */
function reapplyCollapsedState() {
  if (!renderer) return;

  const cy = renderer.getCy();
  if (!cy) return;

  cy.startBatch();

  // First show all
  cy.elements().show();

  // Then hide successors of collapsed nodes
  for (const nodeId of collapsedNodes) {
    const node = cy.getElementById(nodeId);
    if (node && node.length > 0) {
      node.successors().hide();
    }
  }

  cy.endBatch();
}

/**
 * Update collapse controls visibility and count
 */
function updateCollapseControls() {
  const controls = document.getElementById('collapse-controls');
  const countEl = document.getElementById('collapsed-count');

  if (controls && countEl) {
    if (collapsedNodes.size > 0) {
      controls.classList.remove('hidden');
      countEl.textContent = `${collapsedNodes.size} collapsed`;
    } else {
      controls.classList.add('hidden');
    }
  }
}

/**
 * Handle expand all collapsed nodes
 */
function handleExpandAll() {
  if (!renderer) return;

  const cy = renderer.getCy();
  if (!cy) return;

  // Clear collapsed state
  collapsedNodes.clear();

  // Show all elements
  cy.elements().show();

  // Update UI
  updateCollapseControls();
  updateStats(cy.nodes(':visible').length, cy.edges(':visible').length);
}

/**
 * Handle call selection - center on the call's compound node
 */
function handleCallSelect(callId) {
  hideSidebar();

  // Center on the compound node for this call
  if (renderer) {
    const compoundNodeId = `compound-${callId}`;
    renderer.centerOnNode(compoundNodeId);
  }
}

/**
 * Handle JSON change in editor
 */
function handleJsonChange(callId, json, parsedJson, parseError) {
  // Graph rebuilds via store onChange
}

/**
 * Handle node click
 */
function handleNodeClick(nodeId, nodeData) {
  if (renderer) {
    renderer.selectNode(nodeId);
  }

  // Show details in sidebar - check if node is mapped
  if (nodeData.mapped === 'true' && nodeData.entityType) {
    // Mapped entity - show entity details
    const entityConfig = mappingStore.getEntity(nodeData.entityType);
    showMappedNodeDetails(nodeData, entityConfig, [], []);
  } else {
    // Unmapped node - show raw details
    showRawNodeDetails(nodeData);
  }
}

/**
 * Handle node double-click (expand/collapse or center)
 */
function handleNodeDoubleClick(nodeId, nodeData) {
  if (!renderer) return;

  const cy = renderer.getCy();
  if (!cy) return;

  const node = cy.getElementById(nodeId);
  if (!node || node.length === 0) return;

  // Check if this node has successors (can be collapsed/expanded)
  const successors = node.successors();

  if (successors.length > 0) {
    // Toggle collapse state
    if (collapsedNodes.has(nodeId)) {
      // Expand: show successors
      collapsedNodes.delete(nodeId);
      successors.show();
    } else {
      // Collapse: hide successors
      collapsedNodes.add(nodeId);
      successors.hide();
    }

    // Update UI
    updateCollapseControls();
    updateStats(cy.nodes(':visible').length, cy.edges(':visible').length);

    // Center on node
    renderer.centerOnNode(nodeId);
  } else {
    // No children, just center
    renderer.centerOnNode(nodeId);
  }
}

/**
 * Handle navigation to a related node
 */
function handleNodeNavigate(nodeId) {
  if (renderer) {
    renderer.selectNode(nodeId);
    renderer.centerOnNode(nodeId);

    const nodeData = renderer.getNodeData(nodeId);
    if (nodeData) {
      showRawNodeDetails(nodeData);
    }
  }
}

/**
 * Handle sidebar close
 */
function handleSidebarClose() {
  if (renderer) {
    renderer.resetStyles();
  }
}

/**
 * Initialize header buttons
 */
function initHeaderButtons() {
  // Mapping button
  const mappingBtn = document.getElementById('btn-mapping');
  if (mappingBtn) {
    mappingBtn.addEventListener('click', openMappingModal);
  }

  // Actions dropdown
  const actionsBtn = document.getElementById('btn-actions');
  const actionsMenu = document.getElementById('actions-menu');
  if (actionsBtn && actionsMenu) {
    actionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionsMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      actionsMenu.classList.add('hidden');
    });
  }

  // Example button
  const exampleBtn = document.getElementById('btn-load-example');
  if (exampleBtn) {
    exampleBtn.addEventListener('click', loadExample);
  }

  // Empty state example button
  const emptyExampleBtn = document.getElementById('btn-load-example-empty');
  if (emptyExampleBtn) {
    emptyExampleBtn.addEventListener('click', loadExample);
  }

  // Export button
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
  }

  // Export Model button
  const exportModelBtn = document.getElementById('btn-export-model');
  if (exportModelBtn) {
    exportModelBtn.addEventListener('click', handleExportModel);
  }

  // Import button
  const importBtn = document.getElementById('btn-import');
  if (importBtn) {
    importBtn.addEventListener('click', handleImport);
  }

  // Import file input
  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        processImportedFile(file);
        // Reset input so same file can be imported again
        importFileInput.value = '';
      }
    });
  }

  // Onboarding button
  const onboardingBtn = document.getElementById('btn-onboarding');
  if (onboardingBtn) {
    onboardingBtn.addEventListener('click', launchOnboarding);
  }
}

async function launchOnboarding() {
  // Load example data first (ask if there's existing data)
  const hasData = callsStore.getCallCount() > 1 ||
    (callsStore.getCallCount() === 1 && callsStore.getActiveCall()?.json?.trim());

  if (hasData && !(await showConfirm('Guided Tour', 'The tour will load example data. This will replace your current data. Continue?'))) {
    return;
  }

  // Load example without confirm (we already asked)
  callsStore.clearAll();
  mappingStore.clearAll();
  collapsedNodes.clear();

  for (const [entityId, entityConfig] of Object.entries(petstoreConfig.entities)) {
    mappingStore.setEntity(entityId, { label: entityConfig.label, pk: entityConfig.pk, displayField: entityConfig.displayField, color: entityConfig.color });
  }
  for (const relation of petstoreConfig.relations) {
    mappingStore.addRelation(relation.from, relation.to, relation.toFk);
  }

  const callsToCreate = [
    { name: 'GET Client 1', dataKey: 'get_client_details', apiKey: 'get_client_details' },
    { name: 'GET Client 2', dataKey: 'get_client_details_2', apiKey: 'get_client_details' },
    { name: 'GET Dossier 1', dataKey: 'get_dossier', apiKey: 'get_dossier' },
    { name: 'GET Dossier 2', dataKey: 'get_dossier_2', apiKey: 'get_dossier' },
    { name: 'LIST Factures', dataKey: 'list_factures', apiKey: 'list_factures' },
    { name: 'LIST Clients', dataKey: 'list_clients', apiKey: 'list_clients' },
  ];

  for (const callDef of callsToCreate) {
    const data = petstoreData[callDef.dataKey];
    if (!data) continue;
    const callId = callsStore.createCall(callDef.name);
    callsStore.updateJson(callId, JSON.stringify(data, null, 2));
    const apiConfig = petstoreConfig.apiCalls[callDef.apiKey];
    if (apiConfig?.extractions) callsStore.updateExtractions(callId, apiConfig.extractions);
  }

  rebuildGraph();

  // Start tour after a short delay for render
  setTimeout(() => startOnboarding(), 300);
}

/**
 * Initialize graph toolbar
 */
function initGraphToolbar() {
  // Prevent graph overlay controls from propagating pointer events to Cytoscape
  document.querySelectorAll('.graph-overlay-toolbar, .focus-controls, .pathfinder-controls').forEach(el => {
    for (const evt of ['mousedown', 'mousemove', 'mouseup', 'wheel', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove']) {
      el.addEventListener(evt, e => e.stopPropagation());
    }
  });
  // Layout button
  const layoutBtn = document.getElementById('btn-layout');
  if (layoutBtn) {
    layoutBtn.addEventListener('click', () => {
      if (renderer) {
        renderer.runLayoutDagre();
      }
    });
  }

  // Fit button
  const fitBtn = document.getElementById('btn-fit');
  if (fitBtn) {
    fitBtn.addEventListener('click', () => {
      if (renderer) {
        renderer.fitToView();
      }
    });
  }

  // Clear all button
  const clearBtn = document.getElementById('btn-clear-all');
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearAll);
  }

  // Hide unmapped checkbox
  const hideUnmappedChk = document.getElementById('chk-hide-unmapped');
  if (hideUnmappedChk) {
    hideUnmappedChk.addEventListener('change', () => {
      hideUnmapped = hideUnmappedChk.checked;
      rebuildGraph();
    });
  }

  // Toggle minimap button
  const toggleMinimapBtn = document.getElementById('btn-toggle-minimap');
  const minimapEl = document.getElementById('graph-minimap');
  const overlayToolbar = document.getElementById('graph-overlay-toolbar');
  if (toggleMinimapBtn && minimapEl) {
    toggleMinimapBtn.addEventListener('click', () => {
      minimapEl.classList.toggle('hidden');
      toggleMinimapBtn.classList.toggle('active');
      if (overlayToolbar) {
        overlayToolbar.style.top = minimapEl.classList.contains('hidden') ? '10px' : '140px';
      }
    });
  }

  // Expand all button
  const expandAllBtn = document.getElementById('btn-expand-all');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', handleExpandAll);
  }

  // Query bar
  initQueryBar();
}

// Query state
let activeQuickFilter = null;
let activeEntityFilter = null;
let autocompleteData = { entities: [] };
let selectedAutocompleteIndex = -1;

/**
 * Initialize the query bar for searching/filtering nodes
 */
function initQueryBar() {
  const queryInput = document.getElementById('query-input');
  const autocompleteEl = document.getElementById('query-autocomplete');
  const helpBtn = document.getElementById('btn-query-help');
  const clearBtn = document.getElementById('btn-query-clear');

  if (!queryInput) return;

  let debounceTimer = null;

  // Apply query on input with debounce - but don't hide autocomplete
  queryInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);

    // Clear quick filters when typing
    clearQuickFilters();

    // Clear any error state while typing
    queryInput.classList.remove('query-error', 'query-success');
    queryInput.title = '';

    // Show autocomplete
    updateAutocomplete(queryInput.value);

    const value = queryInput.value.trim();
    if (!value) {
      applyQuery('');
      return;
    }
    debounceTimer = setTimeout(() => {
      applyQuery(queryInput.value.trim());
    }, 400);
  });

  // Handle keyboard navigation
  queryInput.addEventListener('keydown', (e) => {
    const items = autocompleteEl?.querySelectorAll('.autocomplete-item') || [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
      updateAutocompleteSelection(items);
    } else if (e.key === 'Enter') {
      if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
        e.preventDefault();
        selectAutocompleteItem(items[selectedAutocompleteIndex]);
      } else {
        clearTimeout(debounceTimer);
        hideAutocomplete();
        applyQuery(queryInput.value);
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      queryInput.value = '';
      applyQuery('');
      queryInput.blur();
    } else if (e.key === 'Tab' && selectedAutocompleteIndex >= 0) {
      e.preventDefault();
      selectAutocompleteItem(items[selectedAutocompleteIndex]);
    }
  });

  // Hide autocomplete on blur (with delay for click)
  queryInput.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 200);
  });

  // Show autocomplete on focus if there's content
  queryInput.addEventListener('focus', () => {
    if (queryInput.value) {
      updateAutocomplete(queryInput.value);
    }
  });

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      queryInput.value = '';
      hideAutocomplete();
      clearQuickFilters();
      applyQuery('');
    });
  }

  // Help button - open modal
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      const modal = document.getElementById('modal-query-help');
      const content = document.getElementById('query-help-content');
      if (modal && content) {
        content.innerHTML = `<pre class="code-block">${escapeHtml(getQueryHelp())}</pre>`;
        modal.classList.add('open');
        modal.querySelector('.modal-backdrop')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
        modal.querySelectorAll('.modal-close').forEach(btn =>
          btn.addEventListener('click', () => modal.classList.remove('open'), { once: true })
        );
      }
    });
  }

  // Quick filters
  initQuickFilters();
}

/**
 * Initialize quick filter buttons
 */
function initQuickFilters() {
  const quickFilters = document.getElementById('quick-filters');
  if (!quickFilters) return;

  quickFilters.querySelectorAll('.btn-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterType = btn.dataset.filter;

      // Toggle filter
      if (activeQuickFilter === filterType) {
        clearQuickFilters();
        applyQuery('');
      } else {
        // Clear query input
        const queryInput = document.getElementById('query-input');
        if (queryInput) {
          queryInput.value = '';
          queryInput.classList.remove('query-error', 'query-success');
        }

        // Apply quick filter
        clearQuickFilters();
        btn.classList.add('active');
        activeQuickFilter = filterType;

        const cy = renderer?.getCy();
        if (cy) {
          const { count } = applyQuickFilter(cy, filterType);
          btn.title = `${count} match${count !== 1 ? 'es' : ''}`;
        }
      }
    });
  });
}

/**
 * Clear all quick filters
 */
function clearQuickFilters() {
  activeQuickFilter = null;
  activeEntityFilter = null;
  activeCallFilter = null;
  const quickFilters = document.getElementById('quick-filters');
  if (quickFilters) {
    quickFilters.querySelectorAll('.btn-chip').forEach(btn => {
      btn.classList.remove('active');
    });
  }
  // Also clear call filters
  const callFilters = document.getElementById('call-filters');
  if (callFilters) {
    callFilters.querySelectorAll('.call-chip').forEach(btn => {
      btn.classList.remove('active');
    });
  }
  // Also clear legend selection
  const legendEl = document.getElementById('graph-legend');
  if (legendEl) {
    legendEl.querySelectorAll('.legend-item').forEach(item => {
      item.classList.remove('active');
    });
  }
}

/**
 * Update autocomplete suggestions
 */
function updateAutocomplete(query) {
  const autocompleteEl = document.getElementById('query-autocomplete');
  if (!autocompleteEl) return;

  // Refresh autocomplete data from graph
  const cy = renderer?.getCy();
  if (cy) {
    autocompleteData = extractAutocompleteData(cy);
  }

  if (!query || autocompleteData.entities.length === 0) {
    hideAutocomplete();
    return;
  }

  const trimmed = query.trim().toLowerCase();
  let html = '';

  // Check if we're after a dot (suggesting fields)
  const dotMatch = trimmed.match(/^(\w+)\.(\w*)$/);

  if (dotMatch) {
    const [, entityPrefix, fieldPrefix] = dotMatch;
    const entity = autocompleteData.entities.find(e =>
      e.type.toLowerCase() === entityPrefix.toLowerCase()
    );

    if (entity) {
      const matchingFields = entity.fields.filter(f =>
        f.name.toLowerCase().startsWith(fieldPrefix)
      );

      if (matchingFields.length > 0) {
        html = `<div class="autocomplete-section">
          <div class="autocomplete-header">Fields for ${entity.type}</div>
          ${matchingFields.map(f => `
            <div class="autocomplete-item" data-value="${entity.type}.${f.name}">
              <span class="field-name">${f.name}</span>
              <span class="field-type">${f.type}</span>
            </div>
          `).join('')}
        </div>`;
      }
    }
  } else {
    // Suggest entity types
    const matchingEntities = autocompleteData.entities.filter(e =>
      e.type.toLowerCase().startsWith(trimmed) || trimmed === ''
    );

    if (matchingEntities.length > 0) {
      html = `<div class="autocomplete-section">
        <div class="autocomplete-header">Entity types</div>
        ${matchingEntities.map(e => `
          <div class="autocomplete-item" data-value="${e.type}.">
            <span class="entity-dot" style="background-color: ${e.color}"></span>
            <span class="field-name">${e.type}</span>
            <span class="field-type">${e.fields.length} fields</span>
          </div>
        `).join('')}
      </div>`;
    }
  }

  if (html) {
    autocompleteEl.innerHTML = html;
    autocompleteEl.classList.remove('hidden');
    selectedAutocompleteIndex = -1;

    // Add mousedown handlers (fires before blur, so selection works)
    autocompleteEl.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent blur
        selectAutocompleteItem(item);
      });
    });
  } else {
    hideAutocomplete();
  }
}

/**
 * Hide autocomplete dropdown
 */
function hideAutocomplete() {
  const autocompleteEl = document.getElementById('query-autocomplete');
  if (autocompleteEl) {
    autocompleteEl.classList.add('hidden');
  }
  selectedAutocompleteIndex = -1;
}

/**
 * Update autocomplete selection highlight
 */
function updateAutocompleteSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedAutocompleteIndex);
  });
}

/**
 * Select an autocomplete item
 */
function selectAutocompleteItem(item) {
  const value = item.dataset.value;
  const queryInput = document.getElementById('query-input');

  if (queryInput && value) {
    queryInput.value = value;
    queryInput.focus();

    // If value ends with dot, show field suggestions
    if (value.endsWith('.')) {
      updateAutocomplete(value);
    } else {
      hideAutocomplete();
    }
  }
}

/**
 * Apply a query to highlight matching nodes
 */
function applyQuery(query) {
  if (!renderer) return;

  const cy = renderer.getCy();
  if (!cy) return;

  const { count, error } = applyQueryHighlight(cy, query);

  // Update query input status
  const queryInput = document.getElementById('query-input');
  if (queryInput) {
    queryInput.classList.remove('query-error', 'query-success');

    if (error) {
      queryInput.classList.add('query-error');
      queryInput.title = error;
    } else if (query && query.trim()) {
      queryInput.classList.add('query-success');
      queryInput.title = `${count} match${count !== 1 ? 'es' : ''}`;
    } else {
      queryInput.title = '';
    }
  }
}

/**
 * Handle legend item click for filtering
 */
function handleLegendClick(entityType, legendItem) {
  // Clear other filters
  const queryInput = document.getElementById('query-input');
  if (queryInput) {
    queryInput.value = '';
    queryInput.classList.remove('query-error', 'query-success');
  }

  // Toggle filter
  if (activeEntityFilter === entityType) {
    clearQuickFilters();
    applyQuery('');
  } else {
    clearQuickFilters();
    legendItem.classList.add('active');
    activeEntityFilter = entityType;

    const cy = renderer?.getCy();
    if (cy) {
      filterByEntityType(cy, entityType);
    }
  }
}

/**
 * Open mapping modal
 */
function openMappingModal() {
  openMappingPanel();
}

/**
 * Handle mapping apply
 */
function handleMappingApply() {
  // Rebuild graph with new mapping
  rebuildGraph();
}

/**
 * Load example data - CRM with entity merging demonstration
 */
async function loadExample() {
  // Ask for confirmation if there's existing data
  const hasData = callsStore.getCallCount() > 1 ||
    (callsStore.getCallCount() === 1 && callsStore.getActiveCall()?.json?.trim());

  if (hasData && !(await showConfirm('Load Example', 'This will replace all current data. Continue?'))) {
    return;
  }

  // Clear existing data
  callsStore.clearAll();
  mappingStore.clearAll();
  collapsedNodes.clear();

  // Set up entities from petstore config
  for (const [entityId, entityConfig] of Object.entries(petstoreConfig.entities)) {
    mappingStore.setEntity(entityId, {
      label: entityConfig.label,
      pk: entityConfig.pk,
      displayField: entityConfig.displayField,
      color: entityConfig.color,
    });
  }

  // Set up relations
  for (const relation of petstoreConfig.relations) {
    mappingStore.addRelation(relation.from, relation.to, relation.toFk);
  }

  // Create calls for each API response
  const callsToCreate = [
    { name: 'GET Client 1', dataKey: 'get_client_details', apiKey: 'get_client_details' },
    { name: 'GET Client 2', dataKey: 'get_client_details_2', apiKey: 'get_client_details' },
    { name: 'GET Dossier 1', dataKey: 'get_dossier', apiKey: 'get_dossier' },
    { name: 'GET Dossier 2', dataKey: 'get_dossier_2', apiKey: 'get_dossier' },
    { name: 'LIST Factures', dataKey: 'list_factures', apiKey: 'list_factures' },
    { name: 'LIST Clients', dataKey: 'list_clients', apiKey: 'list_clients' },
  ];

  for (const callDef of callsToCreate) {
    const data = petstoreData[callDef.dataKey];
    if (!data) continue;

    const callId = callsStore.createCall(callDef.name);
    callsStore.updateJson(callId, JSON.stringify(data, null, 2));

    // Set extractions based on API config
    const apiConfig = petstoreConfig.apiCalls[callDef.apiKey];
    if (apiConfig && apiConfig.extractions) {
      callsStore.updateExtractions(callId, apiConfig.extractions);
    }
  }

  // Refresh the UI
  rebuildGraph();
}

/**
 * Handle clear all
 */
async function handleClearAll() {
  if (!(await showConfirm('Clear All', 'Clear all calls, mappings and data? This cannot be undone.'))) {
    return;
  }

  callsStore.clearAll();
  mappingStore.clearAll();
  collapsedNodes.clear();  // Reset collapsed state
  hiddenTypes.clear();     // Reset hidden types
  activeCallFilter = null; // Reset call filter
  callsStore.createCall(); // Create empty call
  hideSidebar();

  // Clear UI elements
  updateLegend();          // Clear legend
  updateCallFilters();     // Clear call filter chips
  updateHiddenPanel();     // Clear hidden panel
}

/**
 * Handle export - exports calls and mapping configuration
 */
function handleExportModel() {
  const data = {
    version: 1,
    type: 'model',
    mapping: mappingStore.exportData(),
    extractions: callsStore.getAllCalls().map(call => ({
      name: call.name,
      extractions: call.extractions || [],
    })),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'jsonebula-model.json';
  a.click();

  URL.revokeObjectURL(url);
}

function handleExport() {
  const data = {
    version: 1,
    calls: callsStore.exportData(),
    mapping: mappingStore.exportData(),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'json-nebula-session.json';
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Handle import - imports calls and mapping configuration
 */
function handleImport() {
  const fileInput = document.getElementById('import-file-input');
  if (!fileInput) return;

  fileInput.click();
}

/**
 * Process imported file
 */
function processImportedFile(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Handle both old format (direct calls) and new format (with version)
      if (data.version === 1) {
        // Full session export (calls + mapping)
        if (data.calls) {
          callsStore.importData(data.calls);
        }
        if (data.mapping) {
          mappingStore.importData(data.mapping);
        }
        // Model-only import: apply extractions to existing calls by name
        if (data.type === 'model' && data.extractions) {
          const existingCalls = callsStore.getAllCalls();
          for (const ext of data.extractions) {
            const match = existingCalls.find(c => c.name === ext.name);
            if (match && ext.extractions?.length) {
              callsStore.updateExtractions(match.id, ext.extractions);
            }
          }
        }
      } else if (data.calls && Array.isArray(data.calls)) {
        // Old format - just calls data
        callsStore.importData(data);
      } else {
        throw new Error('Invalid file format');
      }

      // Rebuild graph after import
      rebuildGraph();
    } catch (err) {
      console.error('Import error:', err);
      alert('Failed to import: ' + err.message);
    }
  };

  reader.onerror = () => {
    alert('Failed to read file');
  };

  reader.readAsText(file);
}

/**
 * Show error message
 */
function showError(message) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; color: #f85149;">
        <div>
          <h1>Error</h1>
          <p>${message}</p>
        </div>
      </div>
    `;
  }
}

/**
 * Enter focus mode on a specific node
 * @param {string} nodeId - The node ID to focus on
 */
function enterFocusMode(nodeId) {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  focusMode = true;
  focusNodeId = nodeId;

  // Show focus controls
  const focusControls = document.getElementById('focus-controls');
  if (focusControls) {
    focusControls.classList.remove('hidden');
  }

  // Apply focus
  applyFocusDepth();
}

/**
 * Exit focus mode
 */
function exitFocusMode() {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  focusMode = false;
  focusNodeId = null;

  // Hide focus controls
  const focusControls = document.getElementById('focus-controls');
  if (focusControls) {
    focusControls.classList.add('hidden');
  }

  // Show all elements, then reapply collapsed state
  cy.elements().show();
  cy.elements().removeClass('faded');

  // Reapply collapsed nodes state
  reapplyCollapsedState();

  // Re-run the default layout to restore positions
  renderer.runLayoutDagre();
}

/**
 * Apply focus depth - show only nodes within N levels of the focus node
 * Uses concentric layout centered on the focused node
 */
function applyFocusDepth() {
  if (!focusMode || !focusNodeId || !renderer) {
    return;
  }
  const cy = renderer.getCy();
  if (!cy) return;

  // Try to find the node - CSS.escape may have issues with special chars
  let focusNode = cy.$(`#${CSS.escape(focusNodeId)}`);

  // Fallback: try getElementById directly
  if (focusNode.length === 0) {
    focusNode = cy.getElementById(focusNodeId);
  }

  if (focusNode.length === 0) {
    return;
  }

  // Get neighborhood up to focusDepth levels
  let neighborhood = focusNode;
  for (let i = 0; i < focusDepth; i++) {
    neighborhood = neighborhood.union(neighborhood.neighborhood());
  }

  // Also include compound parents of visible nodes
  const parents = neighborhood.parent();
  neighborhood = neighborhood.union(parents);

  // Hide non-neighborhood nodes using Cytoscape's native hide/show
  const toHide = cy.elements().not(neighborhood);

  // First hide everything not in neighborhood
  toHide.hide();

  // Show neighborhood, but respect collapsed nodes
  // Don't show successors of collapsed nodes
  let toShow = neighborhood;
  for (const collapsedNodeId of collapsedNodes) {
    const collapsedNode = cy.getElementById(collapsedNodeId);
    if (collapsedNode.length > 0) {
      const successors = collapsedNode.successors();
      toShow = toShow.not(successors);
    }
  }
  toShow.show();

  // Get only the non-compound nodes for layout
  const layoutNodes = neighborhood.filter('node[!isCompound]');

  // Run concentric layout centered on focus node
  if (layoutNodes.length > 1) {
    layoutNodes.layout({
      name: 'concentric',
      concentric: (node) => {
        // Focus node at center, others by distance
        if (node.id() === focusNodeId) return 1000;
        // Check depth from focus node
        const path = cy.elements().aStar({
          root: focusNode,
          goal: node,
        });
        return path.found ? 1000 - (path.distance * 100) : 0;
      },
      levelWidth: () => 1,
      animate: true,
      animationDuration: 400,
      fit: true,
      padding: 50,
    }).run();
  } else {
    // Just center on the focus node
    cy.animate({
      center: { eles: focusNode },
      duration: 300,
    });
  }
}

/**
 * Initialize focus mode controls
 */
function initFocusControls() {
  const depthSlider = document.getElementById('focus-depth');
  const depthValue = document.getElementById('focus-depth-value');
  const exitBtn = document.getElementById('btn-exit-focus');

  if (depthSlider) {
    depthSlider.addEventListener('input', () => {
      focusDepth = parseInt(depthSlider.value, 10);
      if (depthValue) {
        depthValue.textContent = focusDepth;
      }
      applyFocusDepth();
    });
  }

  if (exitBtn) {
    exitBtn.addEventListener('click', exitFocusMode);
  }
}

/**
 * Update the entity legend
 */
function updateLegend() {
  const legendEl = document.getElementById('graph-legend');
  if (!legendEl) return;

  const entities = mappingStore.getAllEntities();

  if (entities.length === 0) {
    legendEl.innerHTML = '';
    return;
  }

  legendEl.innerHTML = entities.map(entity => `
    <div class="legend-item" data-entity-type="${entity.id}" title="Click to filter by ${entity.label}">
      <span class="legend-color" style="background-color: ${entity.color}"></span>
      <span class="legend-label">${escapeHtml(entity.label)}</span>
    </div>
  `).join('');

  // Add click handlers for filtering
  legendEl.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const entityType = item.dataset.entityType;
      handleLegendClick(entityType, item);
    });
  });
}

/**
 * Update the call filter chips
 */
function updateCallFilters() {
  const filtersEl = document.getElementById('call-filters');
  if (!filtersEl) return;

  const calls = callsStore.getAllCalls().filter(c => c.parsedJson !== null);

  if (calls.length <= 1) {
    filtersEl.innerHTML = '';
    activeCallFilter = null;
    return;
  }

  filtersEl.innerHTML = calls.map(call => {
    const shortName = call.name.length > 15 ? call.name.substring(0, 12) + '...' : call.name;
    const isActive = activeCallFilter === call.id;
    return `
      <button class="btn btn-chip call-chip ${isActive ? 'active' : ''}"
              data-call-id="${call.id}"
              title="${escapeHtml(call.name)}">
        ${escapeHtml(shortName)}
      </button>
    `;
  }).join('');

  // Add click handlers
  filtersEl.querySelectorAll('.call-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const callId = chip.dataset.callId;
      handleCallFilterClick(callId, chip);
    });
  });
}

/**
 * Handle call filter chip click
 */
function handleCallFilterClick(callId, chipEl) {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  // Save current state before clearing (clearQuickFilters resets activeCallFilter)
  const wasActive = activeCallFilter === callId;

  // Clear other filters (but not call filters if we're toggling)
  activeQuickFilter = null;
  activeEntityFilter = null;
  const quickFilters = document.getElementById('quick-filters');
  if (quickFilters) {
    quickFilters.querySelectorAll('.btn-chip').forEach(btn => {
      btn.classList.remove('active');
    });
  }
  const legendEl = document.getElementById('graph-legend');
  if (legendEl) {
    legendEl.querySelectorAll('.legend-item').forEach(item => {
      item.classList.remove('active');
    });
  }

  // Toggle filter
  if (wasActive) {
    // Deactivate
    activeCallFilter = null;
    chipEl.classList.remove('active');
    cy.nodes().show();
    cy.edges().show();
    // Reapply collapsed state
    reapplyCollapsedState();
  } else {
    // Activate this filter
    activeCallFilter = callId;

    // Update chip states
    document.querySelectorAll('.call-chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');

    // Show only nodes from this call (and compound nodes)
    cy.nodes().forEach(node => {
      const nodeCallId = node.data('callId');
      const isCompound = node.data('isCompound') === 'true';

      if (isCompound) {
        // Show compound if it's for the selected call
        if (node.id() === `compound-${callId}`) {
          node.show();
        } else {
          node.hide();
        }
      } else if (nodeCallId === callId) {
        node.show();
      } else {
        node.hide();
      }
    });

    // Show edges where both endpoints are visible
    cy.edges().forEach(edge => {
      if (edge.source().visible() && edge.target().visible()) {
        edge.show();
      } else {
        edge.hide();
      }
    });
  }

  // Update stats
  const visibleNodes = cy.nodes(':visible').length;
  const visibleEdges = cy.edges(':visible').length;
  updateStats(visibleNodes, visibleEdges);
}

/**
 * Hide an entity type
 */
function hideEntityType(entityType) {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  hiddenTypes.add(entityType);
  cy.$(`node[entityType="${entityType}"]`).hide();
  updateHiddenPanel();
}

/**
 * Show an entity type
 */
function showEntityType(entityType) {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  hiddenTypes.delete(entityType);
  cy.$(`node[entityType="${entityType}"]`).show();
  updateHiddenPanel();
}

/**
 * Show all hidden types
 */
function showAllHiddenTypes() {
  if (!renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  for (const entityType of hiddenTypes) {
    cy.$(`node[entityType="${entityType}"]`).show();
  }
  hiddenTypes.clear();
  updateHiddenPanel();
}

/**
 * Update the hidden nodes panel
 */
function updateHiddenPanel() {
  const panelEl = document.getElementById('hidden-nodes-panel');
  const listEl = document.getElementById('hidden-nodes-list');
  if (!panelEl || !listEl) return;

  if (hiddenTypes.size === 0) {
    panelEl.classList.add('hidden');
    return;
  }

  panelEl.classList.remove('hidden');

  const entities = mappingStore.getAllEntities();
  const entityMap = {};
  for (const e of entities) {
    entityMap[e.id] = e;
  }

  listEl.innerHTML = Array.from(hiddenTypes).map(type => {
    const entity = entityMap[type];
    const color = entity?.color || '#666';
    const label = entity?.label || type;
    return `
      <div class="hidden-node-item">
        <span class="hidden-node-name">
          <span class="legend-color" style="background-color: ${color}"></span>
          ${escapeHtml(label)}
        </span>
        <button class="btn-show-type" data-type="${escapeHtml(type)}">show</button>
      </div>
    `;
  }).join('');

  // Add click handlers
  listEl.querySelectorAll('.btn-show-type').forEach(btn => {
    btn.addEventListener('click', () => {
      showEntityType(btn.dataset.type);
    });
  });
}

/**
 * Initialize hidden panel controls
 */
function initHiddenPanel() {
  const showAllBtn = document.getElementById('btn-show-all-hidden');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', showAllHiddenTypes);
  }
}

/**
 * Set path finder "from" node
 */
function setPathFrom(nodeId, label) {
  pathFromNode = nodeId;
  const el = document.getElementById('pathfinder-from');
  if (el) {
    el.textContent = label || nodeId;
    el.classList.add('selected');
  }
  updatePathFinderUI();
}

/**
 * Set path finder "to" node
 */
function setPathTo(nodeId, label) {
  pathToNode = nodeId;
  const el = document.getElementById('pathfinder-to');
  if (el) {
    el.textContent = label || nodeId;
    el.classList.add('selected');
  }
  updatePathFinderUI();
}

/**
 * Update path finder UI state
 */
function updatePathFinderUI() {
  const controls = document.getElementById('pathfinder-controls');
  const findBtn = document.getElementById('btn-find-path');

  if (controls) {
    if (pathFromNode || pathToNode) {
      controls.classList.remove('hidden');
    } else {
      controls.classList.add('hidden');
    }
  }

  if (findBtn) {
    findBtn.disabled = !(pathFromNode && pathToNode);
  }
}

/**
 * Find and highlight path between selected nodes
 */
function findPath() {
  if (!pathFromNode || !pathToNode || !renderer) return;
  const cy = renderer.getCy();
  if (!cy) return;

  const source = cy.$(`#${CSS.escape(pathFromNode)}`);
  const target = cy.$(`#${CSS.escape(pathToNode)}`);

  if (source.length === 0 || target.length === 0) return;

  // Clear previous highlights
  cy.elements().removeClass('path-highlighted path-endpoint');

  // Use dijkstra to find shortest path
  const dijkstra = cy.elements().dijkstra(source, () => 1);
  const path = dijkstra.pathTo(target);

  if (path.length > 0) {
    // Highlight the path
    path.addClass('path-highlighted');
    source.addClass('path-endpoint');
    target.addClass('path-endpoint');

    // Fit view to path
    cy.animate({
      fit: { eles: path, padding: 50 },
      duration: 300,
    });
  }
}

/**
 * Clear path finder selection
 */
function clearPathFinder() {
  pathFromNode = null;
  pathToNode = null;

  const fromEl = document.getElementById('pathfinder-from');
  const toEl = document.getElementById('pathfinder-to');
  if (fromEl) {
    fromEl.textContent = '?';
    fromEl.classList.remove('selected');
  }
  if (toEl) {
    toEl.textContent = '?';
    toEl.classList.remove('selected');
  }

  // Clear highlights
  if (renderer) {
    const cy = renderer.getCy();
    if (cy) {
      cy.elements().removeClass('path-highlighted path-endpoint');
    }
  }

  updatePathFinderUI();
}

/**
 * Initialize path finder controls
 */
function initPathFinder() {
  const findBtn = document.getElementById('btn-find-path');
  const clearBtn = document.getElementById('btn-clear-path');

  if (findBtn) {
    findBtn.addEventListener('click', findPath);
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', clearPathFinder);
  }
}

/**
 * Initialize keyboard shortcuts
 * Ctrl+N: New call
 * Ctrl+W: Close active call
 * Ctrl+B: Toggle left panel
 * Escape: Close sidebar / exit focus mode
 * F or /: Focus query bar
 * Ctrl+E: Export
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input/textarea
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable ||
      activeEl.closest('.CodeMirror')
    );

    // Ctrl+N: New call
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      callsStore.createCall();
      return;
    }

    // Ctrl+W: Close active call
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const activeCallId = callsStore.getActiveCallId();
      if (activeCallId && callsStore.getCallCount() > 1) {
        callsStore.deleteCall(activeCallId);
      }
      return;
    }

    // Ctrl+B: Toggle left panel
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      toggleLeftPanel();
      return;
    }

    // Ctrl+E: Export
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      handleExport();
      return;
    }

    // Skip remaining shortcuts if typing
    if (isTyping) return;

    // Escape: Close sidebar / exit focus mode
    if (e.key === 'Escape') {
      if (focusMode) {
        exitFocusMode();
      } else {
        hideSidebar();
      }
      return;
    }

    // F or /: Focus query bar
    if (e.key === 'f' || e.key === 'F' || e.key === '/') {
      e.preventDefault();
      const queryInput = document.getElementById('query-input');
      if (queryInput) {
        queryInput.focus();
        queryInput.select();
      }
      return;
    }
  });
}

/**
 * Initialize left panel collapse/expand
 */
function initLeftPanelCollapse() {
  const leftPanel = document.getElementById('left-panel');
  const collapseBtn = document.getElementById('btn-collapse-left');
  const expandBtn = document.getElementById('btn-expand-left');

  if (!leftPanel || !collapseBtn || !expandBtn) return;

  collapseBtn.addEventListener('click', () => {
    collapseLeftPanel();
  });

  expandBtn.addEventListener('click', () => {
    expandLeftPanel();
  });
}

/**
 * Collapse the left panel
 */
function collapseLeftPanel() {
  const leftPanel = document.getElementById('left-panel');
  const expandBtn = document.getElementById('btn-expand-left');
  if (!leftPanel || !expandBtn) return;

  leftPanel.classList.add('collapsed');
  expandBtn.classList.remove('hidden');
  // Trigger graph resize after transition
  setTimeout(() => {
    if (renderer) renderer.resize();
  }, 250);
}

/**
 * Expand the left panel
 */
function expandLeftPanel() {
  const leftPanel = document.getElementById('left-panel');
  const expandBtn = document.getElementById('btn-expand-left');
  if (!leftPanel || !expandBtn) return;

  leftPanel.classList.remove('collapsed');
  expandBtn.classList.add('hidden');
  // Trigger graph resize after transition
  setTimeout(() => {
    if (renderer) renderer.resize();
  }, 250);
}

/**
 * Toggle the left panel
 */
function toggleLeftPanel() {
  const leftPanel = document.getElementById('left-panel');
  if (!leftPanel) return;

  if (leftPanel.classList.contains('collapsed')) {
    expandLeftPanel();
  } else {
    collapseLeftPanel();
  }
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

/**
 * Initialize context menu
 */
function initContextMenu() {
  const contextMenu = document.getElementById('graph-context-menu');
  if (!contextMenu) return;

  let targetNode = null;

  // Hide menu on click outside
  document.addEventListener('click', () => {
    contextMenu.classList.remove('visible');
  });

  // Hide menu on scroll
  document.addEventListener('scroll', () => {
    contextMenu.classList.remove('visible');
  });

  // Handle menu item clicks
  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || item.classList.contains('disabled')) return;

    const action = item.dataset.action;
    if (!action || !targetNode) return;

    const nodeData = targetNode.data();

    switch (action) {
      case 'focus':
        // Enter focus mode on this node
        enterFocusMode(targetNode.id());
        break;

      case 'hide-type':
        // Hide nodes of this entity type
        if (nodeData.entityType) {
          hideEntityType(nodeData.entityType);
        }
        break;

      case 'show-all':
        // Show all hidden types and exit focus mode
        showAllHiddenTypes();
        if (focusMode) {
          exitFocusMode();
        }
        break;

      case 'path-from':
        // Set this node as path start
        setPathFrom(targetNode.id(), nodeData.entityLabel || nodeData.label);
        break;

      case 'path-to':
        // Set this node as path end
        setPathTo(targetNode.id(), nodeData.entityLabel || nodeData.label);
        break;

      case 'expand-children':
        // Show successors
        if (renderer) {
          const cy = renderer.getCy();
          if (cy) {
            const successors = targetNode.successors();
            successors.show();
            cy.animate({
              fit: { eles: targetNode.union(successors), padding: 50 },
              duration: 300,
            });
          }
        }
        break;

      case 'collapse':
        // Hide successors and track state
        if (renderer) {
          const cy = renderer.getCy();
          if (cy) {
            const nodeId = targetNode.id();
            collapsedNodes.add(nodeId);
            targetNode.successors().hide();
            updateCollapseControls();
            updateStats(cy.nodes(':visible').length, cy.edges(':visible').length);
          }
        }
        break;

      case 'copy-json':
        // Copy node JSON to clipboard
        const jsonData = nodeData.entityData || nodeData.rawData;
        if (jsonData) {
          navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
        }
        break;

      case 'copy-path':
        // Copy path to clipboard
        if (nodeData.path) {
          navigator.clipboard.writeText(nodeData.path);
        }
        break;
    }

    contextMenu.classList.remove('visible');
  });

  // Expose function to show context menu (called from renderer)
  window.showGraphContextMenu = (event, node) => {
    targetNode = node;
    const nodeData = node.data();

    // Enable/disable items based on node type
    const hideTypeItem = contextMenu.querySelector('[data-action="hide-type"]');
    if (hideTypeItem) {
      if (nodeData.entityType) {
        hideTypeItem.classList.remove('disabled');
        hideTypeItem.textContent = `Hide "${nodeData.entityType}"`;
      } else {
        hideTypeItem.classList.add('disabled');
        hideTypeItem.textContent = 'Hide this type';
      }
    }

    // Position and show menu
    contextMenu.style.left = `${event.originalEvent.clientX}px`;
    contextMenu.style.top = `${event.originalEvent.clientY}px`;
    contextMenu.classList.add('visible');

    // Prevent menu from going off-screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.siExplorer = {
  callsStore,
  mappingStore,
  renderer: () => renderer,
};
