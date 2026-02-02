/**
 * Config Schema V4
 *
 * Defines the structure for SI Explorer configuration:
 * - entities: Data types with pk, displayField, color
 * - apiCalls: API response types with extraction paths
 * - relations: FK relationships between entities (inter-call only)
 *
 * Intra-call relations are automatically deduced from extraction structure.
 */

/**
 * Default entity colors palette
 */
export const ENTITY_COLORS = [
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#DC2626', // Red
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#EA580C', // Orange
];

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  entities: {},
  apiCalls: {},
  relations: [],
};

/**
 * Create a new entity with default values
 * @param {string} id - Entity identifier
 * @param {number} colorIndex - Index for color selection
 * @returns {Object} Entity object
 */
export function createEntity(id, colorIndex = 0) {
  const label = id.charAt(0).toUpperCase() + id.slice(1);
  return {
    label,
    pk: 'id',
    displayField: 'id',
    color: ENTITY_COLORS[colorIndex % ENTITY_COLORS.length],
  };
}

/**
 * Create a new API call with default values
 * @param {string} id - API call identifier
 * @returns {Object} API call object
 */
export function createApiCall(id) {
  return {
    label: id,
    description: '',
    extractions: [],
  };
}

/**
 * Create a new extraction
 * @param {string} entity - Entity id
 * @param {string} path - Extraction path
 * @returns {Object} Extraction object
 */
export function createExtraction(entity, path = '$') {
  return { entity, path };
}

/**
 * Create a new relation (FK/inter-call)
 * @param {string} from - Parent entity id
 * @param {string} to - Child entity id
 * @param {string} toFk - FK field path in child entity
 * @param {string} fromPk - PK field path in parent (optional, uses entity pk)
 * @returns {Object} Relation object
 */
export function createRelation(from, to, toFk, fromPk = null) {
  const relation = { from, to, toFk };
  if (fromPk) {
    relation.fromPk = fromPk;
  }
  return relation;
}

/**
 * Validation error types
 */
export const ValidationErrorType = {
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_VALUE: 'INVALID_VALUE',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  DUPLICATE: 'DUPLICATE',
};

/**
 * Validate a configuration object
 * @param {Object} config - Configuration to validate
 * @returns {{ valid: boolean, errors: Array<{ type: string, path: string, message: string }> }}
 */
export function validateConfig(config) {
  const errors = [];

  // Check root structure
  if (!config || typeof config !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: '',
      message: 'Config must be an object',
    });
    return { valid: false, errors };
  }

  // Validate entities
  validateEntities(config.entities, errors);

  // Validate apiCalls
  const entityIds = config.entities ? Object.keys(config.entities) : [];
  validateApiCalls(config.apiCalls, entityIds, errors);

  // Validate relations
  validateRelations(config.relations, entityIds, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate entities section
 */
function validateEntities(entities, errors) {
  if (!entities) {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: 'entities',
      message: 'Config must have an "entities" object',
    });
    return;
  }

  if (typeof entities !== 'object' || Array.isArray(entities)) {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: 'entities',
      message: '"entities" must be an object (not an array)',
    });
    return;
  }

  for (const [entityId, entity] of Object.entries(entities)) {
    validateEntity(entityId, entity, errors);
  }
}

/**
 * Validate a single entity
 */
function validateEntity(entityId, entity, errors) {
  const path = `entities.${entityId}`;

  // Validate entity id format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(entityId)) {
    errors.push({
      type: ValidationErrorType.INVALID_VALUE,
      path,
      message: `Entity id "${entityId}" must be alphanumeric (start with letter/underscore)`,
    });
  }

  if (!entity || typeof entity !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path,
      message: `Entity "${entityId}" must be an object`,
    });
    return;
  }

  // Required: label
  if (!entity.label || typeof entity.label !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.label`,
      message: `Entity "${entityId}" must have a "label" string`,
    });
  }

  // Optional with type check: pk, displayField, color
  if (entity.pk !== undefined && typeof entity.pk !== 'string') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: `${path}.pk`,
      message: `Entity "${entityId}.pk" must be a string`,
    });
  }

  if (entity.displayField !== undefined && typeof entity.displayField !== 'string') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: `${path}.displayField`,
      message: `Entity "${entityId}.displayField" must be a string`,
    });
  }

  if (entity.color !== undefined) {
    if (typeof entity.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(entity.color)) {
      errors.push({
        type: ValidationErrorType.INVALID_VALUE,
        path: `${path}.color`,
        message: `Entity "${entityId}.color" must be a hex color (e.g., #4F46E5)`,
      });
    }
  }
}

/**
 * Validate apiCalls section
 */
function validateApiCalls(apiCalls, entityIds, errors) {
  if (!apiCalls) {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: 'apiCalls',
      message: 'Config must have an "apiCalls" object',
    });
    return;
  }

  if (typeof apiCalls !== 'object' || Array.isArray(apiCalls)) {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: 'apiCalls',
      message: '"apiCalls" must be an object (not an array)',
    });
    return;
  }

  for (const [callId, apiCall] of Object.entries(apiCalls)) {
    validateApiCall(callId, apiCall, entityIds, errors);
  }
}

/**
 * Validate a single API call
 */
function validateApiCall(callId, apiCall, entityIds, errors) {
  const path = `apiCalls.${callId}`;

  if (!apiCall || typeof apiCall !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path,
      message: `API call "${callId}" must be an object`,
    });
    return;
  }

  // Required: label
  if (!apiCall.label || typeof apiCall.label !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.label`,
      message: `API call "${callId}" must have a "label" string`,
    });
  }

  // Optional: description
  if (apiCall.description !== undefined && typeof apiCall.description !== 'string') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: `${path}.description`,
      message: `API call "${callId}.description" must be a string`,
    });
  }

  // Required: extractions array
  if (!apiCall.extractions) {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.extractions`,
      message: `API call "${callId}" must have an "extractions" array`,
    });
  } else if (!Array.isArray(apiCall.extractions)) {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: `${path}.extractions`,
      message: `API call "${callId}.extractions" must be an array`,
    });
  } else {
    // Validate each extraction
    apiCall.extractions.forEach((extraction, idx) => {
      validateExtraction(extraction, idx, callId, entityIds, errors);
    });
  }
}

/**
 * Validate a single extraction
 */
function validateExtraction(extraction, index, callId, entityIds, errors) {
  const path = `apiCalls.${callId}.extractions[${index}]`;

  if (!extraction || typeof extraction !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path,
      message: `Extraction at index ${index} must be an object`,
    });
    return;
  }

  // Required: entity
  if (!extraction.entity || typeof extraction.entity !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.entity`,
      message: `Extraction at index ${index} must have an "entity" string`,
    });
  } else if (!entityIds.includes(extraction.entity)) {
    errors.push({
      type: ValidationErrorType.INVALID_REFERENCE,
      path: `${path}.entity`,
      message: `Extraction references unknown entity "${extraction.entity}"`,
    });
  }

  // Required: path
  if (!extraction.path || typeof extraction.path !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.path`,
      message: `Extraction at index ${index} must have a "path" string`,
    });
  }
}

/**
 * Validate relations section
 */
function validateRelations(relations, entityIds, errors) {
  if (!relations) {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: 'relations',
      message: 'Config must have a "relations" array',
    });
    return;
  }

  if (!Array.isArray(relations)) {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: 'relations',
      message: '"relations" must be an array',
    });
    return;
  }

  const relationKeys = new Set();

  relations.forEach((relation, index) => {
    validateRelation(relation, index, entityIds, relationKeys, errors);
  });
}

/**
 * Validate a single relation
 */
function validateRelation(relation, index, entityIds, relationKeys, errors) {
  const path = `relations[${index}]`;

  if (!relation || typeof relation !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path,
      message: `Relation at index ${index} must be an object`,
    });
    return;
  }

  // Required: from, to, toFk
  if (!relation.from || typeof relation.from !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.from`,
      message: `Relation at index ${index} must have a "from" string`,
    });
  } else if (!entityIds.includes(relation.from)) {
    errors.push({
      type: ValidationErrorType.INVALID_REFERENCE,
      path: `${path}.from`,
      message: `Relation "from" references unknown entity "${relation.from}"`,
    });
  }

  if (!relation.to || typeof relation.to !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.to`,
      message: `Relation at index ${index} must have a "to" string`,
    });
  } else if (!entityIds.includes(relation.to)) {
    errors.push({
      type: ValidationErrorType.INVALID_REFERENCE,
      path: `${path}.to`,
      message: `Relation "to" references unknown entity "${relation.to}"`,
    });
  }

  if (!relation.toFk || typeof relation.toFk !== 'string') {
    errors.push({
      type: ValidationErrorType.MISSING_FIELD,
      path: `${path}.toFk`,
      message: `Relation at index ${index} must have a "toFk" string (FK field in child)`,
    });
  }

  // Optional: fromPk
  if (relation.fromPk !== undefined && typeof relation.fromPk !== 'string') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      path: `${path}.fromPk`,
      message: `Relation "fromPk" must be a string`,
    });
  }

  // Check for duplicates
  if (relation.from && relation.to && relation.toFk) {
    const key = `${relation.from}-${relation.to}-${relation.toFk}`;
    if (relationKeys.has(key)) {
      errors.push({
        type: ValidationErrorType.DUPLICATE,
        path,
        message: `Duplicate relation: ${relation.from} → ${relation.to} (toFk: ${relation.toFk})`,
      });
    } else {
      relationKeys.add(key);
    }
  }
}

/**
 * Normalize a config by applying defaults
 * @param {Object} config - Configuration object
 * @returns {Object} Normalized configuration
 */
export function normalizeConfig(config) {
  const normalized = {
    entities: {},
    apiCalls: {},
    relations: [],
  };

  // Normalize entities
  if (config.entities) {
    let colorIndex = 0;
    for (const [id, entity] of Object.entries(config.entities)) {
      normalized.entities[id] = {
        label: entity.label || id,
        pk: entity.pk || 'id',
        displayField: entity.displayField || 'id',
        color: entity.color || ENTITY_COLORS[colorIndex % ENTITY_COLORS.length],
      };
      colorIndex++;
    }
  }

  // Normalize apiCalls
  if (config.apiCalls) {
    for (const [id, apiCall] of Object.entries(config.apiCalls)) {
      normalized.apiCalls[id] = {
        label: apiCall.label || id,
        description: apiCall.description || '',
        extractions: (apiCall.extractions || []).map(e => ({
          entity: e.entity,
          path: e.path || '$',
        })),
      };
    }
  }

  // Normalize relations
  if (Array.isArray(config.relations)) {
    normalized.relations = config.relations.map(rel => {
      const normalized = {
        from: rel.from,
        to: rel.to,
        toFk: rel.toFk,
      };
      if (rel.fromPk) {
        normalized.fromPk = rel.fromPk;
      }
      return normalized;
    });
  }

  return normalized;
}
