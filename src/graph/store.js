/**
 * Graph Store V4
 *
 * Manages the exploration graph state, built from the V4 data store.
 * V4 uses both intra-call edges (from nested JSON structure) and
 * inter-call edges (from FK relationships in config).
 */

import { configStore } from '../config/store.js';
import { dataStore } from '../data/store.js';

/**
 * Create node ID from type and PK value
 * @param {string} type - Entity type
 * @param {*} pkValue - Primary key value
 * @returns {string}
 */
export function createNodeId(type, pkValue) {
  return `${type}-${pkValue}`;
}

/**
 * Parse node ID to get type and PK value
 * @param {string} nodeId - Node ID
 * @returns {{ type: string, pkValue: string }}
 */
export function parseNodeId(nodeId) {
  const dashIndex = nodeId.indexOf('-');
  if (dashIndex === -1) {
    return { type: nodeId, pkValue: '' };
  }
  return {
    type: nodeId.substring(0, dashIndex),
    pkValue: nodeId.substring(dashIndex + 1),
  };
}

/**
 * Create the graph store
 */
function createGraphStore() {
  // nodes: Map<nodeId, { type, data, pkValue }>
  // edges: Map<edgeId, { source, target, edgeType, relation? }>
  let nodes = new Map();
  let edges = new Map();
  const listeners = new Set();

  /**
   * Notify listeners of changes
   */
  function notifyListeners() {
    const state = {
      nodes: getNodes(),
      edges: getEdges(),
    };
    listeners.forEach(callback => {
      try {
        callback(state);
      } catch (e) {
        console.error('Graph listener error:', e);
      }
    });
  }

  /**
   * Get all nodes as array
   */
  function getNodes() {
    return Array.from(nodes.values());
  }

  /**
   * Get all edges as array
   */
  function getEdges() {
    return Array.from(edges.values());
  }

  return {
    /**
     * Build the graph from V4 data store
     * Uses entities and both intra/inter edges from the data store
     */
    buildFromData() {
      nodes.clear();
      edges.clear();

      // Build nodes from V4 data store entities
      const allEntities = dataStore.getAllEntities();

      for (const entity of allEntities) {
        const nodeId = createNodeId(entity.type, entity.pk);
        nodes.set(nodeId, {
          id: nodeId,
          type: entity.type,
          pkValue: entity.pk,
          data: entity.data,
          sourceCall: entity.sourceCall,
          extractPath: entity.extractPath,
        });
      }

      // Build edges from V4 data store (both intra and inter)
      const allEdges = dataStore.getAllEdges();

      for (const edge of allEdges) {
        const sourceId = createNodeId(edge.fromType, edge.fromPk);
        const targetId = createNodeId(edge.toType, edge.toPk);

        // Only add edge if both nodes exist
        if (nodes.has(sourceId) && nodes.has(targetId)) {
          const edgeId = `${sourceId}--${targetId}--${edge.edgeType}`;
          edges.set(edgeId, {
            id: edgeId,
            source: sourceId,
            target: targetId,
            edgeType: edge.edgeType, // 'intra' or 'inter'
            relation: {
              from: edge.fromType,
              to: edge.toType,
            },
          });
        }
      }

      notifyListeners();
    },

    /**
     * Add a single node
     * @param {string} type - Entity type
     * @param {Object} data - Node data
     * @param {*} pkValue - PK value
     * @returns {string|null} Node ID or null on failure
     */
    addNode(type, data, pkValue) {
      if (pkValue === undefined || pkValue === null) {
        console.warn(`Missing PK value for type "${type}"`);
        return null;
      }

      const nodeId = createNodeId(type, pkValue);

      if (nodes.has(nodeId)) {
        // Update existing node data
        nodes.get(nodeId).data = data;
      } else {
        nodes.set(nodeId, {
          id: nodeId,
          type,
          pkValue,
          data,
        });
      }

      notifyListeners();
      return nodeId;
    },

    /**
     * Remove a node and its connected edges
     * @param {string} nodeId - Node ID
     */
    removeNode(nodeId) {
      if (nodes.has(nodeId)) {
        nodes.delete(nodeId);

        // Remove connected edges
        for (const [edgeId, edge] of edges) {
          if (edge.source === nodeId || edge.target === nodeId) {
            edges.delete(edgeId);
          }
        }

        notifyListeners();
      }
    },

    /**
     * Get a node by ID
     * @param {string} nodeId - Node ID
     * @returns {Object|null}
     */
    getNode(nodeId) {
      return nodes.get(nodeId) || null;
    },

    /**
     * Check if node exists
     * @param {string} nodeId - Node ID
     * @returns {boolean}
     */
    hasNode(nodeId) {
      return nodes.has(nodeId);
    },

    /**
     * Get all nodes
     * @returns {Array}
     */
    getNodes,

    /**
     * Get all edges
     * @returns {Array}
     */
    getEdges,

    /**
     * Get nodes by type
     * @param {string} type - Entity type
     * @returns {Array}
     */
    getNodesByType(type) {
      return Array.from(nodes.values()).filter(n => n.type === type);
    },

    /**
     * Get node count
     * @returns {number}
     */
    getNodeCount() {
      return nodes.size;
    },

    /**
     * Get edge count
     * @returns {number}
     */
    getEdgeCount() {
      return edges.size;
    },

    /**
     * Get edge counts by type
     * @returns {{ intra: number, inter: number, total: number }}
     */
    getEdgeCounts() {
      let intra = 0;
      let inter = 0;
      for (const edge of edges.values()) {
        if (edge.edgeType === 'intra') intra++;
        else if (edge.edgeType === 'inter') inter++;
      }
      return { intra, inter, total: edges.size };
    },

    /**
     * Clear the graph
     */
    clear() {
      nodes.clear();
      edges.clear();
      notifyListeners();
    },

    /**
     * Subscribe to changes
     * @param {Function} callback - Callback
     * @returns {Function} Unsubscribe
     */
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Get edges connected to a node
     * @param {string} nodeId - Node ID
     * @returns {{ incoming: Array, outgoing: Array }}
     */
    getConnectedEdges(nodeId) {
      const incoming = [];
      const outgoing = [];

      for (const edge of edges.values()) {
        if (edge.source === nodeId) {
          outgoing.push(edge);
        }
        if (edge.target === nodeId) {
          incoming.push(edge);
        }
      }

      return { incoming, outgoing };
    },

    /**
     * Get edges by type
     * @param {'intra' | 'inter'} edgeType - Edge type
     * @returns {Array}
     */
    getEdgesByType(edgeType) {
      return Array.from(edges.values()).filter(e => e.edgeType === edgeType);
    },
  };
}

// Export singleton
export const graphStore = createGraphStore();
