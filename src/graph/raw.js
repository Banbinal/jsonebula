/**
 * Raw JSON to Graph Converter (V5)
 *
 * Converts raw JSON data into graph nodes and edges.
 * Smart flattening:
 * - Arrays [] always become nodes (collections of entities)
 * - Objects {} become nodes only if they contain arrays
 * - Nested objects without arrays are flattened (version.name, version.url)
 * - Primitives become properties on parent nodes
 */

const MAX_DEPTH = 15;
const MAX_NODES = 5000;

/**
 * Check if a value contains any arrays (recursively)
 */
function containsArray(value) {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== 'object') return false;

  for (const v of Object.values(value)) {
    if (containsArray(v)) return true;
  }
  return false;
}

/**
 * Collect all primitives from an object, flattening nested objects that don't contain arrays
 * Uses __ as separator for nested keys (Cytoscape selectors use . for property access)
 * Returns { "name": "value", "version__name": "black-2", "version__url": "..." }
 */
function collectPrimitivesDeep(obj, prefix = '') {
  const primitives = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}__${key}` : key;

    if (value === null || typeof value !== 'object') {
      // Primitive value
      primitives[fullKey] = value;
    } else if (Array.isArray(value)) {
      // Arrays become child nodes - skip here
    } else if (!containsArray(value)) {
      // Nested object without arrays - flatten it
      Object.assign(primitives, collectPrimitivesDeep(value, fullKey));
    }
    // Objects containing arrays will become child nodes - skip here
  }

  return primitives;
}

/**
 * Get children that should become nodes (arrays or objects containing arrays)
 */
function getNodeChildren(obj) {
  const children = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      // Arrays always become nodes
      children.push({ key, value, type: 'array' });
    } else if (containsArray(value)) {
      // Objects containing arrays become nodes
      children.push({ key, value, type: 'object' });
    }
    // Plain nested objects are flattened - not added as children
  }

  return children;
}

/**
 * Convert JSON to graph nodes and edges
 *
 * @param {*} json - Parsed JSON data
 * @param {string} callId - Call ID (for node ID prefixing)
 * @param {Object} options - Options
 * @param {number} options.maxDepth - Maximum traversal depth
 * @param {number} options.maxNodes - Maximum nodes to create
 * @returns {{ nodes: Array, edges: Array, truncated: boolean }}
 */
export function jsonToGraph(json, callId, options = {}) {
  const maxDepth = options.maxDepth || MAX_DEPTH;
  const maxNodes = options.maxNodes || MAX_NODES;

  const nodes = [];
  const edges = [];
  let nodeCount = 0;
  let truncated = false;

  function nodeId(path) {
    return `${callId}:${path.join('.')}`;
  }

  function getPreview(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const type = typeof value;
    if (type === 'object') {
      if (Array.isArray(value)) return `[${value.length} items]`;
      return `{${Object.keys(value).length} keys}`;
    }
    if (type === 'string') {
      return value.length > 30 ? `"${value.substring(0, 27)}..."` : `"${value}"`;
    }
    return String(value);
  }

  function getLabel(key, value, isRoot) {
    if (isRoot) return '$'; // Root node is labeled with $ to indicate JSON root
    return key !== undefined ? String(key) : '';
  }

  function traverse(value, path, key, parentId, depth) {
    if (nodeCount >= maxNodes) {
      truncated = true;
      return;
    }
    if (depth > maxDepth) {
      truncated = true;
      return;
    }

    const isRoot = path.length === 0;
    const currentPath = isRoot ? ['$'] : path;
    const id = nodeId(currentPath);

    if (Array.isArray(value)) {
      nodes.push({
        id,
        type: 'array',
        label: getLabel(key, value, isRoot),
        preview: `[${value.length}]`,
        path: currentPath.join('.'),
        data: value,
        primitives: {},
        itemCount: value.length,
        callId,
      });
      nodeCount++;

      if (parentId) {
        edges.push({
          id: `${parentId}->${id}`,
          source: parentId,
          target: id,
          edgeType: 'raw',
        });
      }

      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          traverse(item, [...currentPath, index], index, id, depth + 1);
        }
      });
      return;
    }

    if (value !== null && typeof value === 'object') {
      const primitives = collectPrimitivesDeep(value);
      const nodeChildren = getNodeChildren(value);

      nodes.push({
        id,
        type: 'object',
        label: getLabel(key, value, isRoot),
        preview: getPreview(value),
        path: currentPath.join('.'),
        data: value,
        primitives,
        childCount: nodeChildren.length,
        callId,
      });
      nodeCount++;

      if (parentId) {
        edges.push({
          id: `${parentId}->${id}`,
          source: parentId,
          target: id,
          edgeType: 'raw',
        });
      }

      for (const child of nodeChildren) {
        traverse(child.value, [...currentPath, child.key], child.key, id, depth + 1);
      }
      return;
    }

    if (isRoot) {
      nodes.push({
        id,
        type: 'primitive',
        label: 'root',
        preview: getPreview(value),
        path: currentPath.join('.'),
        data: value,
        primitives: {},
        callId,
      });
      nodeCount++;
    }
  }

  if (json === null || json === undefined) {
    return { nodes: [], edges: [], truncated: false };
  }

  traverse(json, [], undefined, null, 0);

  return { nodes, edges, truncated };
}

/**
 * Merge graphs from multiple calls
 *
 * @param {Array<{ callId: string, json: * }>} calls - Array of calls with parsed JSON
 * @param {Object} options - Options passed to jsonToGraph
 * @returns {{ nodes: Array, edges: Array, truncated: boolean }}
 */
export function mergeCallGraphs(calls, options = {}) {
  const allNodes = [];
  const allEdges = [];
  let anyTruncated = false;

  for (const call of calls) {
    if (call.json === null || call.json === undefined) {
      continue;
    }

    const { nodes, edges, truncated } = jsonToGraph(call.json, call.callId, options);

    allNodes.push(...nodes);
    allEdges.push(...edges);

    if (truncated) {
      anyTruncated = true;
    }
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    truncated: anyTruncated,
  };
}

/**
 * Get node statistics
 *
 * @param {Array} nodes - Graph nodes
 * @returns {{ objects: number, arrays: number, total: number, byCall: Object }}
 */
export function getNodeStats(nodes) {
  const stats = {
    objects: 0,
    arrays: 0,
    primitives: 0,
    total: nodes.length,
    byCall: {},
  };

  for (const node of nodes) {
    if (node.type === 'object') stats.objects++;
    else if (node.type === 'array') stats.arrays++;
    else stats.primitives++;

    if (node.callId) {
      stats.byCall[node.callId] = (stats.byCall[node.callId] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Find node by path
 *
 * @param {Array} nodes - Graph nodes
 * @param {string} path - Path string (e.g., "$.items.0.name")
 * @returns {Object|null}
 */
export function findNodeByPath(nodes, path) {
  return nodes.find(n => n.path === path) || null;
}

/**
 * Get children of a node
 *
 * @param {string} nodeId - Parent node ID
 * @param {Array} edges - Graph edges
 * @param {Array} nodes - Graph nodes
 * @returns {Array}
 */
export function getChildNodes(nodeId, edges, nodes) {
  const childIds = edges
    .filter(e => e.source === nodeId)
    .map(e => e.target);

  return nodes.filter(n => childIds.includes(n.id));
}

/**
 * Get parent of a node
 *
 * @param {string} nodeId - Child node ID
 * @param {Array} edges - Graph edges
 * @param {Array} nodes - Graph nodes
 * @returns {Object|null}
 */
export function getParentNode(nodeId, edges, nodes) {
  const edge = edges.find(e => e.target === nodeId);
  if (!edge) return null;

  return nodes.find(n => n.id === edge.source) || null;
}
