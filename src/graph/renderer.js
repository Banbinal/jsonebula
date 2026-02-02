/**
 * Cytoscape Renderer V5
 *
 * Wrapper for Cytoscape.js handling rendering, styling, and interactions.
 * Unified view: raw JSON structure with mapped entities highlighted.
 */

/**
 * Create a graph renderer instance
 */
export function createGraphRenderer() {
  let cy = null;
  let containerEl = null;
  let nodeClickCallback = null;
  let nodeDoubleClickCallback = null;
  let navigatorInitialized = false;

  return {
    /**
     * Initialize Cytoscape in a container
     * @param {HTMLElement} container - DOM container
     */
    init(container) {
      containerEl = container;

      cy = cytoscape({
        container,
        style: [
          // === NODE STYLES ===
          // Object node (default - unmapped)
          {
            selector: 'node[nodeType="object"]',
            style: {
              'background-color': '#21262d',
              'label': 'data(label)',
              'color': '#e6edf3',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '10px',
              'width': '60px',
              'height': '25px',
              'shape': 'rectangle',              // Simpler than roundrectangle
              'border-width': 1,
              'border-color': '#30363d',
              'text-wrap': 'ellipsis',
              'text-max-width': '55px',
            },
          },
          // Array node
          {
            selector: 'node[nodeType="array"]',
            style: {
              'background-color': '#1a2332',
              'label': 'data(label)',
              'color': '#58a6ff',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '10px',
              'width': '50px',
              'height': '22px',
              'shape': 'rectangle',              // Simpler than roundrectangle
              'border-width': 1,
              'border-color': '#388bfd',
              'text-wrap': 'ellipsis',
              'text-max-width': '45px',
            },
          },
          // Mapped entity node (colored circle)
          {
            selector: 'node[mapped="true"]',
            style: {
              'background-color': 'data(color)',
              'label': 'data(entityLabel)',
              'color': '#e6edf3',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'font-size': '11px',
              'font-weight': '600',
              'width': '50px',
              'height': '50px',
              'shape': 'ellipse',
              'border-width': 2,
              'border-color': '#30363d',
              'text-margin-y': 8,
              'text-wrap': 'wrap',
              'text-max-width': '150px',
            },
          },
          // Compound node (Call container) - simplified for performance
          {
            selector: 'node[isCompound="true"]',
            style: {
              'background-color': '#161b22',
              'background-opacity': 0.6,
              'border-width': 1,
              'border-color': '#30363d',
              'label': 'data(label)',
              'color': '#8b949e',
              'text-valign': 'top',
              'text-halign': 'center',
              'text-margin-y': -10,
              'font-size': '11px',
              'padding': '15px',
              'shape': 'rectangle',             // Simpler than roundrectangle
            },
          },

          // === STATE STYLES ===
          // Faded state (for focus mode)
          {
            selector: '.faded',
            style: {
              'opacity': 0.15,
            },
          },
          // Hidden state
          {
            selector: '.hidden',
            style: {
              'display': 'none',
            },
          },
          // Focus hidden state (for focus mode - hides non-neighborhood nodes)
          {
            selector: '.focus-hidden',
            style: {
              'display': 'none',
            },
          },
          // Path highlight state
          {
            selector: '.path-highlighted',
            style: {
              'border-width': 4,
              'border-color': '#d29922',
              'z-index': 999,
            },
          },
          {
            selector: 'edge.path-highlighted',
            style: {
              'width': 4,
              'line-color': '#d29922',
              'target-arrow-color': '#d29922',
              'z-index': 999,
            },
          },
          // Path endpoint nodes
          {
            selector: '.path-endpoint',
            style: {
              'border-width': 4,
              'border-color': '#3fb950',
            },
          },

          // === EDGE STYLES ===
          // Structural edge (JSON nesting) - use haystack for performance
          {
            selector: 'edge[edgeType="raw"]',
            style: {
              'width': 1,
              'line-color': '#30363d',
              'curve-style': 'haystack',         // Much faster than bezier
              'haystack-radius': 0.5,
              'opacity': 0.5,
            },
          },
          // Relation edge (between mapped entities)
          {
            selector: 'edge[edgeType="relation"]',
            style: {
              'width': 2,
              'line-color': '#58a6ff',
              'target-arrow-color': '#58a6ff',
              'target-arrow-shape': 'triangle',
              'curve-style': 'straight',         // Faster than bezier
              'opacity': 0.8,
            },
          },

          // === COMMON STYLES ===
          // Selected node
          {
            selector: 'node:selected',
            style: {
              'border-color': '#58a6ff',
              'border-width': 3,
            },
          },
          // Highlighted node
          {
            selector: 'node.highlighted',
            style: {
              'border-color': '#3fb950',
              'border-width': 3,
              'z-index': 10,
            },
          },
          // Dimmed node
          {
            selector: 'node.dimmed',
            style: {
              'opacity': 0.15,
            },
          },
          // Node with conflicts (warning border)
          {
            selector: 'node[hasConflicts="true"]',
            style: {
              'border-color': '#f59e0b',
              'border-width': 3,
              'border-style': 'dashed',
            },
          },
          // Highlighted edge
          {
            selector: 'edge.highlighted',
            style: {
              'line-color': '#3fb950',
              'target-arrow-color': '#3fb950',
              'width': 3,
              'opacity': 1,
              'z-index': 10,
            },
          },
          // Dimmed edge
          {
            selector: 'edge.dimmed',
            style: {
              'opacity': 0.1,
            },
          },
        ],
        layout: { name: 'preset' },
        minZoom: 0.1,
        maxZoom: 3,
        wheelSensitivity: 0.3,
        boxSelectionEnabled: false,

        // Performance optimizations for large graphs
        textureOnViewport: true,      // Render to texture during pan/zoom
        hideEdgesOnViewport: true,    // Hide edges during pan/zoom
        hideLabelsOnViewport: true,   // Hide labels during pan/zoom
        pixelRatio: 1,                // Force low resolution for performance
        motionBlur: false,            // Disable motion blur
        selectionType: 'single',      // Only allow single selection
      });

      // Level of Detail: hide labels when zoomed out (debounced)
      let labelsHidden = false;
      let lodTimeout = null;
      cy.on('zoom', () => {
        if (lodTimeout) clearTimeout(lodTimeout);
        lodTimeout = setTimeout(() => {
          const zoom = cy.zoom();
          const shouldHide = zoom < 0.4;

          // Only update if state changed
          if (shouldHide !== labelsHidden) {
            labelsHidden = shouldHide;
            if (shouldHide) {
              cy.style().selector('node').style('label', '').update();
            } else {
              cy.style()
                .selector('node[nodeType="object"]').style('label', 'data(label)')
                .selector('node[nodeType="array"]').style('label', 'data(label)')
                .selector('node[mapped="true"]').style('label', 'data(entityLabel)')
                .selector('node[isCompound="true"]').style('label', 'data(label)')
                .update();
            }
          }
        }, 150);
      });

      // Node click handler
      cy.on('tap', 'node', (e) => {
        if (nodeClickCallback) {
          const nodeId = e.target.id();
          const nodeData = e.target.data();
          nodeClickCallback(nodeId, nodeData);
        }
      });

      // Node double-click handler
      let lastTapTime = 0;
      cy.on('tap', 'node', (e) => {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          if (nodeDoubleClickCallback) {
            const nodeId = e.target.id();
            const nodeData = e.target.data();
            nodeDoubleClickCallback(nodeId, nodeData);
          }
        }
        lastTapTime = now;
      });

      // Background click to deselect
      cy.on('tap', (e) => {
        if (e.target === cy) {
          cy.nodes().unselect();
        }
      });

      // Right-click context menu (cxttap = context tap)
      cy.on('cxttap', 'node', (e) => {
        e.originalEvent.preventDefault();
        if (window.showGraphContextMenu) {
          window.showGraphContextMenu(e, e.target);
        }
      });

      // Prevent default context menu on graph
      container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      // Handle resize
      window.addEventListener('resize', () => {
        if (cy) cy.resize();
      });

    },

    /**
     * Render unified graph (raw structure + mapped entities)
     * @param {Array} nodes - From jsonToGraph()
     * @param {Array} edges - From jsonToGraph()
     * @param {Object} mappings - Optional entity mappings { nodeId: { entityType, entityLabel, color } }
     * @param {Array} relationEdges - Optional relation edges between mapped entities
     * @param {boolean} hideUnmapped - If true, only show mapped nodes
     * @param {Object} callsInfo - Optional { callId: { name } } for compound node labels
     * @param {Map} mergedNodes - Optional map of duplicateNodeId -> canonicalNodeId for merged entities
     */
    render(nodes, edges, mappings = {}, relationEdges = [], hideUnmapped = false, callsInfo = {}, mergedNodes = new Map()) {
      if (!cy) return;

      const elements = [];
      const visibleNodeIds = new Set();
      const visibleCallIds = new Set();

      // First pass: determine which nodes and calls are visible
      // Skip nodes that are merged into another (duplicates)
      for (const node of nodes) {
        // Skip merged duplicate nodes
        if (mergedNodes.has(node.id)) {
          continue;
        }

        const mapping = mappings[node.id];
        if (hideUnmapped && !mapping) {
          continue;
        }
        visibleNodeIds.add(node.id);
        if (node.callId) {
          visibleCallIds.add(node.callId);
        }
      }

      // Create compound parent nodes only for calls with visible content
      for (const callId of visibleCallIds) {
        // Get call name from callsInfo or extract from ID
        const callInfo = callsInfo[callId];
        const callName = callInfo?.name || 'Call';

        // Extract short ID from callId (last part after last dash)
        const idParts = callId.split('-');
        const shortId = idParts[idParts.length - 1] || callId.slice(-8);

        const callLabel = `${callName} (${shortId})`;

        elements.push({
          data: {
            id: `compound-${callId}`,
            label: callLabel,
            nodeType: 'compound',
            isCompound: 'true',
          },
        });
      }

      // Build node elements
      for (const node of nodes) {
        if (!visibleNodeIds.has(node.id)) {
          continue;
        }

        const mapping = mappings[node.id];
        let label = node.label || '';
        if (node.type === 'array') {
          label = `${label} [${node.itemCount || 0}]`;
        } else if (node.type === 'object') {
          label = label || node.preview || '{}';
        }

        // Add source count indicator for merged nodes
        let displayLabel = mapping?.entityLabel || label.substring(0, 40);
        if (mapping?.sourceCount > 1) {
          displayLabel = `${displayLabel} (×${mapping.sourceCount})`;
        }

        // Add conflict indicator
        const hasConflicts = mapping?.hasConflicts || false;
        if (hasConflicts) {
          displayLabel = `⚠️ ${displayLabel}`;
        }

        elements.push({
          data: {
            id: node.id,
            parent: `compound-${node.callId}`,
            label: label.substring(0, 40),
            nodeType: node.type,
            path: node.path,
            rawData: node.data,
            primitives: node.primitives,
            callId: node.callId,
            // Mapping data (if mapped)
            mapped: mapping ? 'true' : 'false',
            entityType: mapping?.entityType || null,
            entityLabel: displayLabel,
            color: mapping?.color || '#21262d',
            entityData: mapping?.data || node.data,
            sourceCount: mapping?.sourceCount || 1,
            // Source tracking for merged entities
            sources: mapping?.sources || [],
            propertySources: mapping?.propertySources || {},
            // Conflict tracking
            conflicts: mapping?.conflicts || {},
            hasConflicts: hasConflicts ? 'true' : 'false',
          },
        });
      }

      // Build set of relation edge pairs to avoid duplicates
      const relationPairs = new Set();
      for (const edge of relationEdges) {
        relationPairs.add(`${edge.source}|${edge.target}`);
      }

      // Build structural edge elements (skip if relation edge exists or nodes not visible)
      // Helper to resolve merged node IDs to canonical
      const resolveNodeId = (nodeId) => mergedNodes.get(nodeId) || nodeId;

      for (const edge of edges) {
        // Resolve to canonical nodes
        const source = resolveNodeId(edge.source);
        const target = resolveNodeId(edge.target);

        // Skip if either node is not visible
        if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
          continue;
        }

        // Skip self-loops created by merging
        if (source === target) {
          continue;
        }

        const pairKey = `${source}|${target}`;
        if (!relationPairs.has(pairKey)) {
          elements.push({
            data: {
              id: `${source}->${target}`,
              source: source,
              target: target,
              edgeType: 'raw',
            },
          });
          relationPairs.add(pairKey); // Prevent duplicate edges after merge
        }
      }

      // Build relation edge elements (only if both nodes visible)
      for (const edge of relationEdges) {
        const source = resolveNodeId(edge.source);
        const target = resolveNodeId(edge.target);

        if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
          continue;
        }

        // Skip self-loops
        if (source === target) {
          continue;
        }

        const pairKey = `${source}|${target}`;
        if (!relationPairs.has(pairKey)) {
          elements.push({
            data: {
              id: `rel-${source}->${target}`,
              source: source,
              target: target,
              edgeType: 'relation',
            },
          });
          relationPairs.add(pairKey);
        }
      }

      // Update graph with batching for performance
      cy.startBatch();
      cy.elements().remove();
      cy.add(elements);
      cy.endBatch();

      // Run hierarchical layout
      this.runLayoutDagre();

      // Initialize navigator (minimap) only for smaller graphs
      const nodeCount = elements.filter(e => e.group === 'nodes').length;
      if (!navigatorInitialized && typeof cy.navigator === 'function' && nodeCount < 1000) {
        try {
          cy.navigator({
            viewLiveFramerate: 0,
            thumbnailEventFramerate: 15,
            thumbnailLiveFramerate: false,
            dblClickDelay: 200,
          });
          navigatorInitialized = true;

          setTimeout(() => {
            const nav = document.querySelector('body > .cytoscape-navigator');
            const container = document.getElementById('graph-minimap');
            if (nav && container) {
              container.appendChild(nav);
            }
          }, 100);
        } catch (e) {
          console.warn('Navigator extension error:', e);
        }
      } else if (nodeCount >= 1000) {
        // Hide minimap container for large graphs
        const container = document.getElementById('graph-minimap');
        if (container) {
          container.style.display = 'none';
        }
      }
    },

    /**
     * Clear the graph
     */
    clear() {
      if (cy) {
        cy.elements().remove();
      }
    },

    /**
     * Run hierarchical layout
     * Two-phase: layout each compound's children, then arrange compounds side by side
     */
    runLayoutDagre() {
      if (!cy || cy.nodes().length === 0) return;

      const nodeCount = cy.nodes().length;
      const shouldAnimate = nodeCount < 500;

      // Get all compound nodes
      const compoundNodes = cy.nodes('[isCompound="true"]');

      if (compoundNodes.length <= 1) {
        // Single compound or no compounds - use simple breadthfirst
        cy.layout({
          name: 'breadthfirst',
          directed: true,
          padding: 30,
          spacingFactor: 1.2,
          animate: shouldAnimate,
          animationDuration: 300,
          fit: true,
        }).run();
        return;
      }

      // Multiple compounds: layout each separately, then arrange side by side
      cy.startBatch();

      // Phase 1: Layout children within each compound using breadthfirst
      const compoundBounds = [];
      let xOffset = 0;
      const compoundGap = 100; // Gap between compound nodes

      compoundNodes.forEach((compound, index) => {
        const children = compound.children();

        if (children.length === 0) {
          compoundBounds.push({ compound, width: 100, height: 100, xOffset });
          xOffset += 100 + compoundGap;
          return;
        }

        // Find root node for this compound (path === '$')
        const rootNode = children.filter(node => node.data('path') === '$');
        const layoutRoots = rootNode.length > 0 ? rootNode : children.roots();

        // Get edges that connect children within this compound
        const childIds = new Set(children.map(n => n.id()));
        const internalEdges = cy.edges().filter(edge => {
          return childIds.has(edge.source().id()) && childIds.has(edge.target().id());
        });

        // Create a collection of children + their internal edges for layout
        const layoutElements = children.union(internalEdges);

        // Run breadthfirst layout on children (non-animated, preset positions)
        layoutElements.layout({
          name: 'breadthfirst',
          directed: true,
          padding: 20,
          spacingFactor: 1.2,
          animate: false,
          fit: false,
          roots: layoutRoots,
        }).run();

        // Calculate bounding box of this compound's children
        const bb = children.boundingBox();
        const width = bb.w || 200;
        const height = bb.h || 200;

        // Shift all children to start at xOffset
        const shiftX = xOffset - bb.x1 + 50; // 50px padding
        const shiftY = 50 - bb.y1; // Start at y=50

        children.forEach(node => {
          const pos = node.position();
          node.position({
            x: pos.x + shiftX,
            y: pos.y + shiftY,
          });
        });

        compoundBounds.push({ compound, width, height, xOffset });
        xOffset += width + compoundGap + 100; // Extra padding for compound borders
      });

      cy.endBatch();

      // Fit view to show all compounds
      if (shouldAnimate) {
        cy.animate({
          fit: { padding: 50 },
          duration: 300,
        });
      } else {
        cy.fit(50);
      }
    },

    /**
     * Get the Cytoscape instance
     */
    getCy() {
      return cy;
    },

    /**
     * Fit graph to view
     */
    fitToView() {
      if (cy) {
        cy.fit(null, 30);
      }
    },

    /**
     * Highlight specific nodes
     * @param {Array<string>} nodeIds - Node IDs to highlight
     */
    highlightNodes(nodeIds) {
      if (!cy) return;

      const nodeSet = new Set(nodeIds);

      cy.nodes().forEach(node => {
        if (nodeSet.has(node.id())) {
          node.addClass('highlighted');
          node.removeClass('dimmed');
        }
      });

      cy.edges().forEach(edge => {
        const sourceHighlighted = nodeSet.has(edge.source().id());
        const targetHighlighted = nodeSet.has(edge.target().id());

        if (sourceHighlighted && targetHighlighted) {
          edge.addClass('highlighted');
          edge.removeClass('dimmed');
        }
      });
    },

    /**
     * Dim specific nodes
     * @param {Array<string>} nodeIds - Node IDs to dim
     */
    dimNodes(nodeIds) {
      if (!cy) return;

      const nodeSet = new Set(nodeIds);

      cy.nodes().forEach(node => {
        if (nodeSet.has(node.id())) {
          node.addClass('dimmed');
          node.removeClass('highlighted');
        }
      });

      cy.edges().forEach(edge => {
        const sourceDimmed = nodeSet.has(edge.source().id());
        const targetDimmed = nodeSet.has(edge.target().id());

        if (sourceDimmed || targetDimmed) {
          edge.addClass('dimmed');
          edge.removeClass('highlighted');
        }
      });
    },

    /**
     * Reset all styles
     */
    resetStyles() {
      if (!cy) return;
      cy.nodes().removeClass('highlighted dimmed');
      cy.edges().removeClass('highlighted dimmed');
    },

    /**
     * Select a node
     * @param {string} nodeId - Node ID
     */
    selectNode(nodeId) {
      if (!cy) return;
      cy.nodes().unselect();
      const node = cy.getElementById(nodeId);
      if (node.length) {
        node.select();
      }
    },

    /**
     * Fit graph to view
     */
    fitToView(padding = 50) {
      if (cy) {
        cy.fit(padding);
      }
    },

    /**
     * Center on a node with smooth animation
     * @param {string} nodeId - Node ID
     */
    centerOnNode(nodeId) {
      if (!cy) return;
      const node = cy.getElementById(nodeId);
      if (node.length) {
        // Smooth pan to node without changing zoom level
        cy.animate({
          center: { eles: node },
          duration: 300,
          easing: 'ease-out',
        });
      }
    },

    /**
     * Set node click callback
     */
    onNodeClick(callback) {
      nodeClickCallback = callback;
    },

    /**
     * Set node double-click callback
     */
    onNodeDoubleClick(callback) {
      nodeDoubleClickCallback = callback;
    },

    /**
     * Get Cytoscape instance
     */
    getCytoscape() {
      return cy;
    },

    /**
     * Resize the graph
     */
    resize() {
      if (cy) {
        cy.resize();
        cy.fit(50);
      }
    },

    /**
     * Destroy the renderer
     */
    destroy() {
      if (cy) {
        cy.destroy();
        cy = null;
      }
    },

    /**
     * Get all node IDs
     */
    getNodeIds() {
      if (!cy) return [];
      return cy.nodes().map(n => n.id());
    },

    /**
     * Get node count
     */
    getNodeCount() {
      return cy ? cy.nodes().length : 0;
    },

    /**
     * Get edge count
     */
    getEdgeCount() {
      return cy ? cy.edges().length : 0;
    },

    /**
     * Get node data by ID
     */
    getNodeData(nodeId) {
      if (!cy) return null;
      const node = cy.getElementById(nodeId);
      return node.length ? node.data() : null;
    },
  };
}
