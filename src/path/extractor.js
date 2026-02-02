/**
 * Path Extractor
 *
 * Extracts objects from JSON data with parent context for intra-call relations.
 * Used by the Extraction Engine to process API call responses.
 */

import {
  parsePath,
  evaluatePath,
  evaluatePathSingle,
  getPathDepth,
  isParentPath,
  getParentPath,
} from './parser.js';

/**
 * Extract objects from data at a given path
 * @param {*} data - JSON data
 * @param {string} path - Path string
 * @returns {Array<{ value: *, extractPath: Array }>} Extracted objects with their paths
 */
export function extractObjects(data, path) {
  const ast = parsePath(path);
  const results = evaluatePath(data, ast);

  return results
    .filter(r => r.value && typeof r.value === 'object')
    .map(r => ({
      value: r.value,
      extractPath: r.path,
    }));
}

/**
 * Extract objects from multiple paths with parent context
 *
 * @param {*} data - JSON data
 * @param {Array<{ entity: string, path: string }>} extractions - Extraction configs
 * @param {Object} entityConfigs - Entity configurations { [entityId]: { pk, ... } }
 * @returns {Array<{
 *   entity: string,
 *   data: Object,
 *   pk: *,
 *   path: string,
 *   extractPath: Array,
 *   parentEntity: string|null,
 *   parentPk: *|null
 * }>}
 */
export function extractWithContext(data, extractions, entityConfigs) {
  if (!extractions || extractions.length === 0) {
    return [];
  }

  // Sort extractions by path depth (shallowest first)
  const sortedExtractions = [...extractions].sort((a, b) => {
    return getPathDepth(a.path) - getPathDepth(b.path);
  });

  // Track extracted objects with their paths for parent matching
  const extractedByPath = new Map(); // Map<pathKey, { entity, pk }>
  const results = [];

  for (const extraction of sortedExtractions) {
    const { entity, path } = extraction;
    const entityConfig = entityConfigs[entity];

    if (!entityConfig) {
      console.warn(`No config for entity "${entity}", skipping`);
      continue;
    }

    const pkField = entityConfig.pk || 'id';
    const objects = extractObjects(data, path);

    for (const { value, extractPath } of objects) {
      // Get PK value
      const pk = evaluatePathSingle(value, pkField);

      if (pk === undefined || pk === null) {
        console.warn(`Object missing PK "${pkField}" for entity "${entity}":`, value);
        continue;
      }

      // Find parent by looking for the closest extracted object
      // whose path is a prefix of our extractPath
      let parentEntity = null;
      let parentPk = null;

      // Build path key for matching
      const pathKey = extractPath.join('.');

      // Look for parent in already extracted objects
      for (const [existingPathKey, existingInfo] of extractedByPath) {
        // Check if existing path is a prefix of current path
        if (pathKey.startsWith(existingPathKey) && pathKey !== existingPathKey) {
          // This could be a parent - check if it's the closest one
          if (!parentEntity || existingPathKey.length > extractedByPath.get(getParentPathKey(parentEntity, parentPk))?.length) {
            parentEntity = existingInfo.entity;
            parentPk = existingInfo.pk;
          }
        }
      }

      // Also check by path structure (for cases where parent is in same extraction batch)
      if (!parentEntity) {
        const parentPath = getParentPath(path);
        if (parentPath) {
          // Find the extraction that matches the parent path
          for (const otherExtraction of sortedExtractions) {
            if (otherExtraction.path === parentPath || isParentPath(otherExtraction.path, path)) {
              // Look in results for matching entity
              const parentResult = results.find(r =>
                r.entity === otherExtraction.entity &&
                isExtractPathParent(r.extractPath, extractPath)
              );
              if (parentResult) {
                parentEntity = parentResult.entity;
                parentPk = parentResult.pk;
                break;
              }
            }
          }
        }
      }

      // Store for future parent matching
      extractedByPath.set(pathKey, { entity, pk });

      results.push({
        entity,
        data: value,
        pk,
        path,
        extractPath,
        parentEntity,
        parentPk,
      });
    }
  }

  return results;
}

/**
 * Check if extractPathA is a parent of extractPathB
 * @param {Array} extractPathA - Parent candidate path
 * @param {Array} extractPathB - Child candidate path
 * @returns {boolean}
 */
function isExtractPathParent(extractPathA, extractPathB) {
  if (!extractPathA || !extractPathB) return false;
  if (extractPathA.length >= extractPathB.length) return false;

  for (let i = 0; i < extractPathA.length; i++) {
    if (extractPathA[i] !== extractPathB[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a unique path key for an extracted entity
 */
function getParentPathKey(entity, pk) {
  return `${entity}:${pk}`;
}

/**
 * Simplified extraction that just returns entity data without parent context
 * @param {*} data - JSON data
 * @param {Array<{ entity: string, path: string }>} extractions - Extraction configs
 * @param {Object} entityConfigs - Entity configurations
 * @returns {Array<{ entity: string, data: Object, pk: * }>}
 */
export function extractSimple(data, extractions, entityConfigs) {
  const results = [];

  for (const { entity, path } of extractions) {
    const entityConfig = entityConfigs[entity];
    if (!entityConfig) continue;

    const pkField = entityConfig.pk || 'id';
    const objects = extractObjects(data, path);

    for (const { value } of objects) {
      const pk = evaluatePathSingle(value, pkField);
      if (pk !== undefined && pk !== null) {
        results.push({ entity, data: value, pk });
      }
    }
  }

  return results;
}

/**
 * Preview what would be extracted (for UI feedback)
 * @param {*} data - JSON data
 * @param {Array<{ entity: string, path: string }>} extractions - Extraction configs
 * @param {Object} entityConfigs - Entity configurations
 * @returns {Object<string, number>} Count per entity type
 */
export function previewExtraction(data, extractions, entityConfigs) {
  const counts = {};

  for (const { entity, path } of extractions) {
    const entityConfig = entityConfigs[entity];
    if (!entityConfig) continue;

    const pkField = entityConfig.pk || 'id';
    const objects = extractObjects(data, path);

    // Count valid objects (with PK)
    let validCount = 0;
    for (const { value } of objects) {
      const pk = evaluatePathSingle(value, pkField);
      if (pk !== undefined && pk !== null) {
        validCount++;
      }
    }

    counts[entity] = (counts[entity] || 0) + validCount;
  }

  return counts;
}
