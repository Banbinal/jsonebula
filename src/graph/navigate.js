/**
 * Bidirectional Navigation V4
 *
 * Enables navigation between parent and child entities.
 * V4: Uses edges from graph store (both intra and inter-call edges).
 */

import { configStore } from '../config/store.js';
import { evaluatePathSingle } from '../path/parser.js';
import { graphStore, createNodeId, parseNodeId } from './store.js';

/**
 * Direction constants
 */
export const Direction = {
  CHILDREN: 'children',
  PARENTS: 'parents',
  ALL: 'all',
};

/**
 * Get related nodes using edges from the graph store
 *
 * @param {string} nodeId - Node ID
 * @param {string} direction - Direction: 'children', 'parents', or 'all'
 * @returns {Array<{ nodeId: string, type: string, data: Object, direction: string, edgeType: string }>}
 */
export function getRelatedNodesFromEdges(nodeId, direction = Direction.ALL) {
  const results = [];
  const { incoming, outgoing } = graphStore.getConnectedEdges(nodeId);

  // Children: nodes that this node points to (outgoing edges)
  if (direction === Direction.CHILDREN || direction === Direction.ALL) {
    for (const edge of outgoing) {
      const targetNode = graphStore.getNode(edge.target);
      if (targetNode) {
        results.push({
          nodeId: edge.target,
          type: targetNode.type,
          data: targetNode.data,
          direction: 'child',
          edgeType: edge.edgeType,
        });
      }
    }
  }

  // Parents: nodes that point to this node (incoming edges)
  if (direction === Direction.PARENTS || direction === Direction.ALL) {
    for (const edge of incoming) {
      const sourceNode = graphStore.getNode(edge.source);
      if (sourceNode) {
        results.push({
          nodeId: edge.source,
          type: sourceNode.type,
          data: sourceNode.data,
          direction: 'parent',
          edgeType: edge.edgeType,
        });
      }
    }
  }

  return results;
}

/**
 * Get all nodes related to a given node (for highlighting)
 * Returns the node itself plus all related nodes.
 *
 * @param {string} nodeId - Node ID
 * @returns {{ center: string, related: Array<string>, all: Array<string> }}
 */
export function getRelatedNodeIds(nodeId) {
  const node = graphStore.getNode(nodeId);
  if (!node) {
    return { center: nodeId, related: [], all: [nodeId] };
  }

  const relatedNodes = getRelatedNodesFromEdges(nodeId, Direction.ALL);
  const relatedIds = relatedNodes.map(r => r.nodeId);

  return {
    center: nodeId,
    related: relatedIds,
    all: [nodeId, ...relatedIds],
  };
}

/**
 * Get node IDs to highlight and dim for a focus operation
 *
 * @param {string} focusNodeId - Node to focus on
 * @returns {{ highlight: Array<string>, dim: Array<string> }}
 */
export function getHighlightSets(focusNodeId) {
  const { all: highlightIds } = getRelatedNodeIds(focusNodeId);
  const highlightSet = new Set(highlightIds);

  const allNodeIds = graphStore.getNodes().map(n => n.id);
  const dimIds = allNodeIds.filter(id => !highlightSet.has(id));

  return {
    highlight: highlightIds,
    dim: dimIds,
  };
}

/**
 * Get summary of relations for a node (for display in sidebar)
 *
 * @param {string} nodeId - Node ID
 * @returns {{ parents: Array, children: Array }}
 */
export function getRelationSummary(nodeId) {
  const node = graphStore.getNode(nodeId);
  if (!node) {
    return { parents: [], children: [] };
  }

  const config = configStore.getConfig();
  const related = getRelatedNodesFromEdges(nodeId, Direction.ALL);

  const parents = related
    .filter(r => r.direction === 'parent')
    .map(r => {
      const entityConfig = config.entities[r.type];
      const displayField = entityConfig?.displayField || 'id';
      const displayValue = evaluatePathSingle(r.data, displayField) || r.nodeId;

      return {
        nodeId: r.nodeId,
        type: r.type,
        label: entityConfig?.label || r.type,
        displayValue: String(displayValue),
        color: entityConfig?.color || '#4F46E5',
        edgeType: r.edgeType,
      };
    });

  const children = related
    .filter(r => r.direction === 'child')
    .map(r => {
      const entityConfig = config.entities[r.type];
      const displayField = entityConfig?.displayField || 'id';
      const displayValue = evaluatePathSingle(r.data, displayField) || r.nodeId;

      return {
        nodeId: r.nodeId,
        type: r.type,
        label: entityConfig?.label || r.type,
        displayValue: String(displayValue),
        color: entityConfig?.color || '#4F46E5',
        edgeType: r.edgeType,
      };
    });

  return { parents, children };
}

// Legacy function for backwards compatibility
export function getRelatedNodes(nodeType, nodeData, direction = Direction.ALL) {
  console.warn('getRelatedNodes is deprecated, use getRelatedNodesFromEdges');

  // Find the node by type and data
  const allNodes = graphStore.getNodes();
  const node = allNodes.find(n => n.type === nodeType && n.data === nodeData);

  if (!node) {
    return [];
  }

  return getRelatedNodesFromEdges(node.id, direction);
}
