/**
 * Mapping Store (V5)
 *
 * Manages entity definitions and relations.
 * Entities define:
 *   - How to interpret extracted data (pk, displayField)
 *   - Where to find them (sources - array of paths)
 * Relations define parent-child links between entities.
 */

import { callsStore } from '../calls/store.js';

const STORAGE_KEY = 'json-nebula-mapping';

// Default color palette
const COLORS = [
  '#4F46E5', // Indigo
  '#059669', // Green
  '#DC2626', // Red
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#EA580C', // Orange
];

/**
 * Create the mapping store
 */
function createMappingStore() {
  // entities: Map<entityId, { label, color, pk, displayField }>
  let entities = new Map();

  // relations: Array<{ from, to, fromPk?, toFk }>
  let relations = [];

  let colorIndex = 0;
  const listeners = new Set();
  let batchMode = false;
  let batchDirty = false;

  /**
   * Notify listeners (skipped during batch mode)
   */
  function notifyListeners() {
    if (batchMode) {
      batchDirty = true;
      return;
    }
    const state = getState();
    listeners.forEach(cb => {
      try {
        cb(state);
      } catch (e) {
        console.error('Mapping store listener error:', e);
      }
    });
  }

  /**
   * Get current state
   */
  function getState() {
    return {
      entities: getAllEntities(),
      relations: [...relations],
    };
  }

  /**
   * Get all entities as array
   */
  function getAllEntities() {
    return Array.from(entities.entries()).map(([id, entity]) => ({
      id,
      ...entity,
    }));
  }

  /**
   * Get next color from palette
   */
  function nextColor() {
    const color = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    return color;
  }

  /**
   * Save to localStorage
   */
  function persist() {
    try {
      const data = {
        entities: Array.from(entities.entries()).map(([id, entity]) => ({
          id,
          ...entity,
        })),
        relations,
        colorIndex,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to persist mapping:', e);
    }
  }

  /**
   * Load from localStorage
   */
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;

      const data = JSON.parse(stored);
      entities.clear();

      for (const entity of data.entities || []) {
        const { id, ...rest } = entity;
        entities.set(id, rest);
      }

      relations = data.relations || [];
      colorIndex = data.colorIndex || entities.size;

      return true;
    } catch (e) {
      console.error('Failed to load mapping:', e);
      return false;
    }
  }

  return {
    /**
     * Initialize store
     */
    init() {
      load();
      notifyListeners();
    },

    /**
     * Add or update an entity
     * @param {string} id - Entity ID (e.g., "client")
     * @param {Object} config - { label?, color?, pk?, displayField?, sources? }
     */
    setEntity(id, config = {}) {
      const existing = entities.get(id);

      entities.set(id, {
        label: config.label || existing?.label || id,
        color: config.color || existing?.color || nextColor(),
        pk: config.pk || existing?.pk || 'id',
        displayField: config.displayField || existing?.displayField || 'id',
        sources: config.sources || existing?.sources || [],
      });

      persist();
      notifyListeners();
    },

    /**
     * Add a source path to an entity
     * @param {string} entityId - Entity ID
     * @param {string} path - Source path (e.g., "$.address")
     */
    addSource(entityId, path) {
      const entity = entities.get(entityId);
      if (!entity) return;

      if (!entity.sources.includes(path)) {
        entity.sources.push(path);
        persist();
        notifyListeners();
      }
    },

    /**
     * Remove a source path from an entity
     * @param {string} entityId - Entity ID
     * @param {string} path - Source path to remove
     */
    removeSource(entityId, path) {
      const entity = entities.get(entityId);
      if (!entity) return;

      const idx = entity.sources.indexOf(path);
      if (idx >= 0) {
        entity.sources.splice(idx, 1);
        persist();
        notifyListeners();
      }
    },

    /**
     * Create a new entity with auto-generated ID
     * @returns {string} Entity ID
     */
    createEntity() {
      const count = entities.size + 1;
      const id = `entity${count}`;

      entities.set(id, {
        label: `Entity ${count}`,
        color: nextColor(),
        pk: 'id',
        displayField: 'id',
        sources: [],
      });

      persist();
      notifyListeners();
      return id;
    },

    /**
     * Update entity ID (rename)
     * @param {string} oldId - Current ID
     * @param {string} newId - New ID
     */
    renameEntity(oldId, newId) {
      if (oldId === newId) return;
      if (entities.has(newId)) {
        console.warn(`Entity "${newId}" already exists`);
        return;
      }

      const entity = entities.get(oldId);
      if (!entity) return;

      entities.delete(oldId);
      entities.set(newId, entity);

      // Update relations
      relations = relations.map(rel => ({
        ...rel,
        from: rel.from === oldId ? newId : rel.from,
        to: rel.to === oldId ? newId : rel.to,
      }));

      // Update extractions in callsStore
      for (const call of callsStore.getAllCalls()) {
        if (!call.extractions) continue;
        const updated = call.extractions.map(ext =>
          ext.entity === oldId ? { ...ext, entity: newId } : ext
        );
        if (updated.some((ext, i) => ext !== call.extractions[i])) {
          callsStore.updateExtractions(call.id, updated);
        }
      }

      persist();
      notifyListeners();
    },

    /**
     * Delete an entity
     * @param {string} id - Entity ID
     */
    deleteEntity(id) {
      if (!entities.has(id)) return;

      entities.delete(id);

      // Remove relations involving this entity
      relations = relations.filter(rel => rel.from !== id && rel.to !== id);

      // Clean up extractions in callsStore
      for (const call of callsStore.getAllCalls()) {
        if (!call.extractions) continue;
        const filtered = call.extractions.filter(ext => ext.entity !== id);
        if (filtered.length !== call.extractions.length) {
          callsStore.updateExtractions(call.id, filtered);
        }
      }

      persist();
      notifyListeners();
    },

    /**
     * Get entity by ID
     * @param {string} id - Entity ID
     */
    getEntity(id) {
      const entity = entities.get(id);
      if (!entity) return null;
      return { id, ...entity };
    },

    /**
     * Get all entities
     */
    getAllEntities,

    /**
     * Get entity count
     */
    getEntityCount() {
      return entities.size;
    },

    /**
     * Add a relation
     * @param {string} from - Source entity ID
     * @param {string} to - Target entity ID
     * @param {string} toFk - FK field path in target entity
     * @param {string} fromPk - Optional PK path in source (defaults to entity's pk)
     */
    addRelation(from, to, toFk, fromPk) {
      // Check if relation already exists
      const exists = relations.some(r =>
        r.from === from && r.to === to && r.toFk === toFk
      );

      if (exists) {
        console.warn('Relation already exists');
        return;
      }

      relations.push({
        from,
        to,
        toFk,
        fromPk: fromPk || undefined,
      });

      persist();
      notifyListeners();
    },

    /**
     * Remove a relation by from/to entity IDs
     * @param {string} from - Source entity ID
     * @param {string} to - Target entity ID
     */
    removeRelation(from, to) {
      const index = relations.findIndex(r => r.from === from && r.to === to);
      if (index >= 0) {
        relations.splice(index, 1);
        persist();
        notifyListeners();
      }
    },

    /**
     * Update a relation
     * @param {number} index - Relation index
     * @param {Object} updates - { from?, to?, toFk?, fromPk? }
     */
    updateRelation(index, updates) {
      if (index < 0 || index >= relations.length) return;

      relations[index] = {
        ...relations[index],
        ...updates,
      };

      persist();
      notifyListeners();
    },

    /**
     * Delete a relation
     * @param {number} index - Relation index
     */
    deleteRelation(index) {
      if (index < 0 || index >= relations.length) return;

      relations.splice(index, 1);

      persist();
      notifyListeners();
    },

    /**
     * Get all relations
     */
    getRelations() {
      return [...relations];
    },

    /**
     * Get relation count
     */
    getRelationCount() {
      return relations.length;
    },

    /**
     * Clear all data
     */
    clearAll() {
      entities.clear();
      relations = [];
      colorIndex = 0;
      persist();
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
     * Start batch mode - suspends notifications until endBatch()
     */
    startBatch() {
      batchMode = true;
      batchDirty = false;
    },

    /**
     * End batch mode - notifies listeners if changes occurred
     */
    endBatch() {
      batchMode = false;
      if (batchDirty) {
        batchDirty = false;
        notifyListeners();
      }
    },

    /**
     * Get current state
     */
    getState,

    /**
     * Export data
     */
    exportData() {
      return {
        entities: getAllEntities(),
        relations: [...relations],
      };
    },

    /**
     * Import data
     */
    importData(data) {
      entities.clear();

      for (const entity of data.entities || []) {
        const { id, ...rest } = entity;
        entities.set(id, rest);
      }

      relations = data.relations || [];
      colorIndex = entities.size;

      persist();
      notifyListeners();
    },
  };
}

// Export singleton
export const mappingStore = createMappingStore();
