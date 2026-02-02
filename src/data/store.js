/**
 * Data Store V4
 *
 * Manages extracted entities and edges (both intra-call and inter-call).
 * - Entities: stored by type and PK
 * - Intra edges: created during extraction (from nested structure)
 * - Inter edges: calculated from FK relations in config
 */

import { configStore } from '../config/store.js';
import { evaluatePathSingle } from '../path/parser.js';

/**
 * Create edge key for deduplication
 */
function edgeKey(fromType, fromPk, toType, toPk) {
  return `${fromType}:${fromPk}->${toType}:${toPk}`;
}

/**
 * Create the data store
 */
function createDataStore() {
  // entities: Map<entityType, Map<pk, { data, sourceCall, extractPath }>>
  const entities = new Map();

  // Edges as Sets of edge keys
  const intraEdges = new Set();
  const interEdges = new Set();

  const listeners = new Set();

  /**
   * Notify listeners
   */
  function notifyListeners() {
    const state = getState();
    listeners.forEach(cb => {
      try {
        cb(state);
      } catch (e) {
        console.error('Data listener error:', e);
      }
    });
  }

  /**
   * Get current state summary
   */
  function getState() {
    return {
      entityCount: getTotalCount(),
      intraEdgeCount: intraEdges.size,
      interEdgeCount: interEdges.size,
    };
  }

  /**
   * Get total entity count
   */
  function getTotalCount() {
    let count = 0;
    for (const typeMap of entities.values()) {
      count += typeMap.size;
    }
    return count;
  }

  /**
   * Ensure type map exists
   */
  function ensureType(type) {
    if (!entities.has(type)) {
      entities.set(type, new Map());
    }
  }

  /**
   * Recalculate inter-call edges based on FK relations
   */
  function recalculateInterEdges() {
    interEdges.clear();

    const relations = configStore.getRelations();
    const entityConfigs = configStore.getEntities();

    for (const relation of relations) {
      const { from: fromType, to: toType, fromPk: fromPkPath, toFk } = relation;

      // Get FK path in "to" entity, PK path in "from" entity
      const fromEntityConfig = entityConfigs[fromType];
      const fromPkField = fromPkPath || fromEntityConfig?.pk || 'id';

      // Get all "to" entities
      const toEntities = entities.get(toType);
      if (!toEntities) continue;

      // Get all "from" entities indexed by PK
      const fromEntities = entities.get(fromType);
      if (!fromEntities) continue;

      // Build index of "from" entities by PK
      const fromIndex = new Map();
      for (const [pk, entity] of fromEntities) {
        const pkValue = evaluatePathSingle(entity.data, fromPkField);
        if (pkValue !== undefined && pkValue !== null) {
          // Store with string key for comparison
          fromIndex.set(String(pkValue), pk);
        }
      }

      // For each "to" entity, find matching "from" via FK
      for (const [toPk, toEntity] of toEntities) {
        const fkValue = evaluatePathSingle(toEntity.data, toFk);

        if (fkValue !== undefined && fkValue !== null) {
          const fromPk = fromIndex.get(String(fkValue));

          if (fromPk !== undefined) {
            interEdges.add(edgeKey(fromType, fromPk, toType, toPk));
          }
        }
      }
    }
  }

  return {
    /**
     * Add entities and intra edges from extraction result
     * @param {{ entities: Array, intraEdges: Array }} extractionResult
     * @returns {{ added: number, updated: number }}
     */
    addFromExtraction(extractionResult) {
      let added = 0;
      let updated = 0;

      // Add entities
      for (const entity of extractionResult.entities) {
        ensureType(entity.type);
        const typeMap = entities.get(entity.type);

        const existing = typeMap.has(entity.pk);
        if (existing) {
          updated++;
        } else {
          added++;
        }

        typeMap.set(entity.pk, {
          data: entity.data,
          sourceCall: entity.sourceCall,
          extractPath: entity.extractPath,
        });
      }

      // Add intra edges
      for (const edge of extractionResult.intraEdges) {
        intraEdges.add(edgeKey(edge.fromType, edge.fromPk, edge.toType, edge.toPk));
      }

      // Recalculate inter edges
      recalculateInterEdges();

      notifyListeners();
      return { added, updated };
    },

    /**
     * Get entity by type and PK
     */
    getEntity(type, pk) {
      const typeMap = entities.get(type);
      if (!typeMap) return null;

      const entity = typeMap.get(pk);
      return entity ? { type, pk, ...entity } : null;
    },

    /**
     * Get all entities of a type
     */
    getEntitiesOfType(type) {
      const typeMap = entities.get(type);
      if (!typeMap) return [];

      return Array.from(typeMap.entries()).map(([pk, entity]) => ({
        type,
        pk,
        ...entity,
      }));
    },

    /**
     * Get all entities
     */
    getAllEntities() {
      const result = [];
      for (const [type, typeMap] of entities) {
        for (const [pk, entity] of typeMap) {
          result.push({ type, pk, ...entity });
        }
      }
      return result;
    },

    /**
     * Get entity count by type
     */
    getCount(type) {
      const typeMap = entities.get(type);
      return typeMap ? typeMap.size : 0;
    },

    /**
     * Get total entity count
     */
    getTotalCount,

    /**
     * Get all entity types that have data
     */
    getTypes() {
      return Array.from(entities.keys());
    },

    /**
     * Get all intra edges as array
     */
    getIntraEdges() {
      const result = [];
      for (const key of intraEdges) {
        const [from, to] = key.split('->');
        const [fromType, fromPk] = from.split(':');
        const [toType, toPk] = to.split(':');
        result.push({ fromType, fromPk, toType, toPk, edgeType: 'intra' });
      }
      return result;
    },

    /**
     * Get all inter edges as array
     */
    getInterEdges() {
      const result = [];
      for (const key of interEdges) {
        const [from, to] = key.split('->');
        const [fromType, fromPk] = from.split(':');
        const [toType, toPk] = to.split(':');
        result.push({ fromType, fromPk, toType, toPk, edgeType: 'inter' });
      }
      return result;
    },

    /**
     * Get all edges (intra + inter)
     */
    getAllEdges() {
      return [...this.getIntraEdges(), ...this.getInterEdges()];
    },

    /**
     * Get edge counts
     */
    getEdgeCounts() {
      return {
        intra: intraEdges.size,
        inter: interEdges.size,
        total: intraEdges.size + interEdges.size,
      };
    },

    /**
     * Check if entity exists
     */
    hasEntity(type, pk) {
      const typeMap = entities.get(type);
      return typeMap ? typeMap.has(pk) : false;
    },

    /**
     * Remove entity
     */
    removeEntity(type, pk) {
      const typeMap = entities.get(type);
      if (!typeMap || !typeMap.has(pk)) return false;

      typeMap.delete(pk);

      // Remove related intra edges
      const prefix = `${type}:${pk}->`;
      const suffix = `->${type}:${pk}`;
      for (const key of intraEdges) {
        if (key.startsWith(prefix) || key.endsWith(suffix)) {
          intraEdges.delete(key);
        }
      }

      // Recalculate inter edges
      recalculateInterEdges();

      notifyListeners();
      return true;
    },

    /**
     * Clear all entities of a type
     */
    clearType(type) {
      if (!entities.has(type)) return;

      // Remove all edges involving this type
      for (const key of [...intraEdges]) {
        if (key.includes(`${type}:`)) {
          intraEdges.delete(key);
        }
      }

      entities.delete(type);
      recalculateInterEdges();
      notifyListeners();
    },

    /**
     * Clear all data
     */
    clearAll() {
      entities.clear();
      intraEdges.clear();
      interEdges.clear();
      notifyListeners();
    },

    /**
     * Manually trigger inter edge recalculation
     * (call after config changes)
     */
    recalculateInterEdges() {
      recalculateInterEdges();
      notifyListeners();
    },

    /**
     * Subscribe to changes
     */
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Get state summary
     */
    getState,

    /**
     * Get edges connected to a specific entity
     */
    getEdgesForEntity(type, pk) {
      const nodeKey = `${type}:${pk}`;
      const incoming = [];
      const outgoing = [];

      const checkEdges = (edgeSet, edgeType) => {
        for (const key of edgeSet) {
          const [from, to] = key.split('->');
          const [fromType, fromPk] = from.split(':');
          const [toType, toPk] = to.split(':');

          if (from === nodeKey) {
            outgoing.push({ fromType, fromPk, toType, toPk, edgeType });
          }
          if (to === nodeKey) {
            incoming.push({ fromType, fromPk, toType, toPk, edgeType });
          }
        }
      };

      checkEdges(intraEdges, 'intra');
      checkEdges(interEdges, 'inter');

      return { incoming, outgoing };
    },
  };
}

// Export singleton
export const dataStore = createDataStore();
