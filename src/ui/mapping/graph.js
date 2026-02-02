/**
 * Schema Graph (Mapping View)
 *
 * Displays entities and relations as a Cytoscape graph for visual schema overview.
 */

import { configStore } from '../../config/store.js';

let cy = null;
let containerEl = null;
let layoutBtn = null;

/**
 * Initialize the schema graph
 */
export function initSchemaGraph() {
  containerEl = document.getElementById('schema-graph');
  layoutBtn = document.getElementById('btn-layout-schema');

  if (!containerEl) {
    console.error('Schema Graph: Missing container element');
    return;
  }

  // Initialize Cytoscape
  cy = cytoscape({
    container: containerEl,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'label': 'data(label)',
          'color': '#e6edf3',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': '500',
          'width': '100px',
          'height': '40px',
          'shape': 'roundrectangle',
          'border-width': 2,
          'border-color': '#30363d',
          'text-outline-width': 0,
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': '#58a6ff',
          'border-width': 3,
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#6e7681',
          'target-arrow-color': '#6e7681',
          'source-arrow-color': '#6e7681',
          'target-arrow-shape': 'triangle',
          'source-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': '10px',
          'color': '#8b949e',
          'text-rotation': 'autorotate',
          'text-margin-y': -10,
        },
      },
    ],
    layout: { name: 'grid' },
    minZoom: 0.3,
    maxZoom: 2,
    wheelSensitivity: 0.3,
  });

  // Layout button
  if (layoutBtn) {
    layoutBtn.addEventListener('click', runLayout);
  }

  // Node click handler
  cy.on('tap', 'node', (e) => {
    const entityId = e.target.id();
    // Could emit event or highlight in entity list
  });

  // Listen for config changes
  configStore.onChange(() => {
    render();
  });

  // Handle container resize
  window.addEventListener('resize', () => {
    if (cy) cy.resize();
  });

  // Initial render
  render();
}

/**
 * Render the graph from current config
 */
function render() {
  if (!cy) return;

  const config = configStore.getConfig();

  // Build elements
  const elements = [];

  // Nodes = entities
  for (const [id, entity] of Object.entries(config.entities)) {
    elements.push({
      data: {
        id,
        label: entity.label || id,
        color: entity.color || '#4F46E5',
      },
    });
  }

  // Edges = relations (V4: toFk is the FK field)
  config.relations.forEach((rel, idx) => {
    elements.push({
      data: {
        id: `rel-${idx}`,
        source: rel.from,
        target: rel.to,
        label: rel.toFk || rel.fk || '', // V4 uses toFk, fallback to fk for compatibility
      },
    });
  });

  // Update graph
  cy.elements().remove();
  cy.add(elements);

  // Run layout
  runLayout();
}

/**
 * Run the layout algorithm
 */
function runLayout() {
  if (!cy || cy.nodes().length === 0) return;

  cy.layout({
    name: 'cose',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 30,
    nodeRepulsion: 8000,
    idealEdgeLength: 100,
    edgeElasticity: 100,
    nestingFactor: 1.2,
    gravity: 0.25,
    numIter: 1000,
    randomize: false,
  }).run();
}

/**
 * Get Cytoscape instance (for external use)
 */
export function getSchemaGraph() {
  return cy;
}
