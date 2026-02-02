/**
 * Config Store V4
 *
 * Manages configuration state with localStorage persistence and event system.
 * Handles entities, apiCalls, and relations (FK only).
 */

import {
  DEFAULT_CONFIG,
  validateConfig,
  normalizeConfig,
  createEntity,
  createApiCall,
  createExtraction,
  createRelation,
  ENTITY_COLORS,
} from './schema.js';

const STORAGE_KEY = 'json-nebula-config';

/**
 * Create the config store
 */
function createConfigStore() {
  let config = loadFromStorage() || { ...DEFAULT_CONFIG, entities: {}, apiCalls: {}, relations: [] };
  const listeners = new Set();

  /**
   * Notify all listeners of config change
   */
  function notifyListeners() {
    listeners.forEach(callback => {
      try {
        callback(config);
      } catch (e) {
        console.error('Config listener error:', e);
      }
    });
  }

  /**
   * Persist config to localStorage
   */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to persist config:', e);
    }
  }

  /**
   * Load config from localStorage
   */
  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const validation = validateConfig(parsed);
        if (validation.valid) {
          return normalizeConfig(parsed);
        } else {
          console.warn('Stored config invalid, using default:', validation.errors);
        }
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
    return null;
  }

  return {
    // ==================== GENERAL ====================

    /**
     * Get the current configuration (deep clone)
     */
    getConfig() {
      return JSON.parse(JSON.stringify(config));
    },

    /**
     * Replace the entire configuration
     */
    setConfig(newConfig) {
      const validation = validateConfig(newConfig);
      if (validation.valid) {
        config = normalizeConfig(newConfig);
        persist();
        notifyListeners();
      }
      return validation;
    },

    /**
     * Clear the configuration
     */
    clear() {
      config = { entities: {}, apiCalls: {}, relations: [] };
      persist();
      notifyListeners();
    },

    /**
     * Subscribe to config changes
     */
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Get available colors
     */
    getColors() {
      return [...ENTITY_COLORS];
    },

    // ==================== ENTITIES ====================

    /**
     * Get all entity IDs
     */
    getEntityIds() {
      return Object.keys(config.entities);
    },

    /**
     * Get entity by ID
     */
    getEntity(id) {
      return config.entities[id] ? { ...config.entities[id] } : null;
    },

    /**
     * Get all entities
     */
    getEntities() {
      return { ...config.entities };
    },

    /**
     * Add a new entity
     */
    addEntity(id, entity = {}) {
      if (config.entities[id]) {
        console.warn(`Entity "${id}" already exists`);
        return false;
      }

      const colorIndex = Object.keys(config.entities).length;
      const defaultEntity = createEntity(id, colorIndex);

      config.entities[id] = {
        ...defaultEntity,
        ...entity,
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Update an existing entity
     */
    updateEntity(id, fields) {
      if (!config.entities[id]) {
        console.warn(`Entity "${id}" not found`);
        return false;
      }

      config.entities[id] = {
        ...config.entities[id],
        ...fields,
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Delete an entity and related references
     */
    deleteEntity(id) {
      if (!config.entities[id]) {
        console.warn(`Entity "${id}" not found`);
        return false;
      }

      // Remove entity
      delete config.entities[id];

      // Remove extractions referencing this entity
      for (const apiCall of Object.values(config.apiCalls)) {
        apiCall.extractions = apiCall.extractions.filter(e => e.entity !== id);
      }

      // Remove relations involving this entity
      config.relations = config.relations.filter(
        rel => rel.from !== id && rel.to !== id
      );

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Rename an entity (updates all references)
     */
    renameEntity(oldId, newId) {
      if (!config.entities[oldId]) {
        console.warn(`Entity "${oldId}" not found`);
        return false;
      }
      if (config.entities[newId]) {
        console.warn(`Entity "${newId}" already exists`);
        return false;
      }

      // Rename entity
      config.entities[newId] = config.entities[oldId];
      delete config.entities[oldId];

      // Update extractions
      for (const apiCall of Object.values(config.apiCalls)) {
        for (const extraction of apiCall.extractions) {
          if (extraction.entity === oldId) {
            extraction.entity = newId;
          }
        }
      }

      // Update relations
      config.relations = config.relations.map(rel => ({
        ...rel,
        from: rel.from === oldId ? newId : rel.from,
        to: rel.to === oldId ? newId : rel.to,
      }));

      persist();
      notifyListeners();
      return true;
    },

    // ==================== API CALLS ====================

    /**
     * Get all API call IDs
     */
    getApiCallIds() {
      return Object.keys(config.apiCalls);
    },

    /**
     * Get API call by ID
     */
    getApiCall(id) {
      return config.apiCalls[id] ? JSON.parse(JSON.stringify(config.apiCalls[id])) : null;
    },

    /**
     * Get all API calls
     */
    getApiCalls() {
      return JSON.parse(JSON.stringify(config.apiCalls));
    },

    /**
     * Add a new API call
     */
    addApiCall(id, apiCall = {}) {
      if (config.apiCalls[id]) {
        console.warn(`API call "${id}" already exists`);
        return false;
      }

      const defaultApiCall = createApiCall(id);

      config.apiCalls[id] = {
        ...defaultApiCall,
        ...apiCall,
        extractions: apiCall.extractions || [],
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Update an existing API call
     */
    updateApiCall(id, fields) {
      if (!config.apiCalls[id]) {
        console.warn(`API call "${id}" not found`);
        return false;
      }

      config.apiCalls[id] = {
        ...config.apiCalls[id],
        ...fields,
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Delete an API call
     */
    deleteApiCall(id) {
      if (!config.apiCalls[id]) {
        console.warn(`API call "${id}" not found`);
        return false;
      }

      delete config.apiCalls[id];

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Rename an API call
     */
    renameApiCall(oldId, newId) {
      if (!config.apiCalls[oldId]) {
        console.warn(`API call "${oldId}" not found`);
        return false;
      }
      if (config.apiCalls[newId]) {
        console.warn(`API call "${newId}" already exists`);
        return false;
      }

      config.apiCalls[newId] = config.apiCalls[oldId];
      delete config.apiCalls[oldId];

      persist();
      notifyListeners();
      return true;
    },

    // ==================== EXTRACTIONS ====================

    /**
     * Add extraction to an API call
     */
    addExtraction(apiCallId, entity, path = '$') {
      if (!config.apiCalls[apiCallId]) {
        console.warn(`API call "${apiCallId}" not found`);
        return false;
      }
      if (!config.entities[entity]) {
        console.warn(`Entity "${entity}" not found`);
        return false;
      }

      config.apiCalls[apiCallId].extractions.push(createExtraction(entity, path));

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Update extraction in an API call
     */
    updateExtraction(apiCallId, index, fields) {
      if (!config.apiCalls[apiCallId]) {
        console.warn(`API call "${apiCallId}" not found`);
        return false;
      }

      const extractions = config.apiCalls[apiCallId].extractions;
      if (index < 0 || index >= extractions.length) {
        console.warn(`Extraction index ${index} out of bounds`);
        return false;
      }

      extractions[index] = {
        ...extractions[index],
        ...fields,
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Delete extraction from an API call
     */
    deleteExtraction(apiCallId, index) {
      if (!config.apiCalls[apiCallId]) {
        console.warn(`API call "${apiCallId}" not found`);
        return false;
      }

      const extractions = config.apiCalls[apiCallId].extractions;
      if (index < 0 || index >= extractions.length) {
        console.warn(`Extraction index ${index} out of bounds`);
        return false;
      }

      extractions.splice(index, 1);

      persist();
      notifyListeners();
      return true;
    },

    // ==================== RELATIONS ====================

    /**
     * Get all relations
     */
    getRelations() {
      return [...config.relations];
    },

    /**
     * Add a new relation
     */
    addRelation(from, to, toFk, fromPk = null) {
      if (!config.entities[from]) {
        console.warn(`Entity "${from}" not found`);
        return false;
      }
      if (!config.entities[to]) {
        console.warn(`Entity "${to}" not found`);
        return false;
      }

      // Check for duplicate
      const exists = config.relations.some(
        rel => rel.from === from && rel.to === to && rel.toFk === toFk
      );
      if (exists) {
        console.warn('Duplicate relation');
        return false;
      }

      config.relations.push(createRelation(from, to, toFk, fromPk));

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Update an existing relation
     */
    updateRelation(index, fields) {
      if (index < 0 || index >= config.relations.length) {
        console.warn(`Relation index ${index} out of bounds`);
        return false;
      }

      config.relations[index] = {
        ...config.relations[index],
        ...fields,
      };

      persist();
      notifyListeners();
      return true;
    },

    /**
     * Delete a relation
     */
    deleteRelation(index) {
      if (index < 0 || index >= config.relations.length) {
        console.warn(`Relation index ${index} out of bounds`);
        return false;
      }

      config.relations.splice(index, 1);

      persist();
      notifyListeners();
      return true;
    },

    // ==================== HELPERS ====================

    /**
     * Get API calls that extract a given entity
     */
    getApiCallsForEntity(entityId) {
      const results = [];
      for (const [callId, apiCall] of Object.entries(config.apiCalls)) {
        const hasEntity = apiCall.extractions.some(e => e.entity === entityId);
        if (hasEntity) {
          results.push({ id: callId, ...apiCall });
        }
      }
      return results;
    },

    /**
     * Get entities extracted by a given API call
     */
    getEntitiesForApiCall(callId) {
      const apiCall = config.apiCalls[callId];
      if (!apiCall) return [];

      const entityIds = [...new Set(apiCall.extractions.map(e => e.entity))];
      return entityIds.map(id => ({ id, ...config.entities[id] })).filter(e => e.label);
    },

    /**
     * Get relations for a given entity (as from or to)
     */
    getRelationsForEntity(entityId) {
      return config.relations
        .map((rel, index) => ({ ...rel, index }))
        .filter(rel => rel.from === entityId || rel.to === entityId);
    },

    /**
     * Check if two entities can have an intra-call relation
     * (are co-extracted from at least one API call)
     */
    canHaveIntraRelation(entityA, entityB) {
      for (const apiCall of Object.values(config.apiCalls)) {
        const entities = apiCall.extractions.map(e => e.entity);
        if (entities.includes(entityA) && entities.includes(entityB)) {
          return true;
        }
      }
      return false;
    },

    /**
     * Get API calls where two entities are co-extracted
     */
    getCoExtractionCalls(entityA, entityB) {
      const results = [];
      for (const [callId, apiCall] of Object.entries(config.apiCalls)) {
        const entities = apiCall.extractions.map(e => e.entity);
        if (entities.includes(entityA) && entities.includes(entityB)) {
          results.push({ id: callId, ...apiCall });
        }
      }
      return results;
    },
  };
}

// Export singleton instance
export const configStore = createConfigStore();
