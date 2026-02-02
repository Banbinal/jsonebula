/**
 * Extraction Engine (V5)
 *
 * Extracts entities from calls based on extraction configs.
 * Calculates intra-call edges (from nesting) and inter-call edges (from FK relations).
 */

import { callsStore } from '../calls/store.js';
import { mappingStore } from '../mapping/store.js';
import { evaluatePath, evaluatePathSingle, getPathDepth } from '../path/parser.js';

/**
 * Extract all entities from all calls
 * @returns {{ entities: Array, intraEdges: Array, interEdges: Array }}
 */
export function extractAllEntities() {
  const calls = callsStore.getAllCalls();
  const entityConfigs = mappingStore.getAllEntities();
  const relations = mappingStore.getRelations();

  // Build entity config map
  const entityConfigMap = {};
  for (const ec of entityConfigs) {
    entityConfigMap[ec.id] = ec;
  }

  const allEntities = [];
  const allIntraEdges = [];

  // Process each call
  for (const call of calls) {
    if (!call.parsedJson || !call.extractions || call.extractions.length === 0) {
      continue;
    }

    const { entities, intraEdges } = extractFromCall(
      call.id,
      call.parsedJson,
      call.extractions,
      entityConfigMap
    );

    allEntities.push(...entities);
    allIntraEdges.push(...intraEdges);
  }

  // Calculate inter-call edges
  const interEdges = calculateInterEdges(allEntities, relations, entityConfigMap);

  return {
    entities: allEntities,
    intraEdges: allIntraEdges,
    interEdges,
  };
}

/**
 * Extract entities from a single call
 */
function extractFromCall(callId, json, extractions, entityConfigMap) {
  const entities = [];
  const intraEdges = [];

  // Sort extractions by path depth (shallowest first for parent tracking)
  const sortedExtractions = [...extractions]
    .filter(ext => ext.entity && ext.path)
    .sort((a, b) => getPathDepth(a.path) - getPathDepth(b.path));

  // Track extracted entities by their JSON path for parent matching
  const extractedByPath = new Map();

  for (const extraction of sortedExtractions) {
    const { entity: entityType, path } = extraction;
    const entityConfig = entityConfigMap[entityType];

    if (!entityConfig) {
      console.warn(`Entity config not found: ${entityType}`);
      continue;
    }

    // Extract objects at path
    const results = evaluatePath(json, path);

    for (const result of results) {
      if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
        continue;
      }

      const data = result.value;
      const extractPath = result.path || [];

      // Get PK value
      const pkValue = evaluatePathSingle(data, entityConfig.pk || 'id');
      if (pkValue === undefined || pkValue === null) {
        continue;
      }

      // Create unique entity ID
      const entityId = `${entityType}-${pkValue}`;

      // Get display value
      const displayValue = evaluatePathSingle(data, entityConfig.displayField || 'id');

      // Find parent entity (closest previously extracted entity whose path is a prefix)
      let parentEntityId = null;
      const pathKey = extractPath.join('.');

      for (const [existingPath, existingEntity] of extractedByPath) {
        if (pathKey.startsWith(existingPath + '.') || pathKey.startsWith(existingPath + '[')) {
          // This is a potential parent - take the longest (closest) match
          if (!parentEntityId || existingPath.length > extractedByPath.get(parentEntityId.split('|')[1])?.length) {
            parentEntityId = existingEntity.entityId;
          }
        }
      }

      // Store for parent matching
      extractedByPath.set(pathKey, { entityId, pathKey });

      entities.push({
        id: entityId,
        type: entityType,
        pk: pkValue,
        data,
        label: displayValue !== undefined ? String(displayValue) : String(pkValue),
        color: entityConfig.color || '#4F46E5',
        callId,
        extractPath: pathKey,
      });

      // Create intra-call edge if parent found
      if (parentEntityId) {
        intraEdges.push({
          id: `intra-${parentEntityId}-${entityId}`,
          source: parentEntityId,
          target: entityId,
          edgeType: 'intra',
        });
      }
    }
  }

  return { entities, intraEdges };
}

/**
 * Calculate inter-call edges based on FK relations
 */
function calculateInterEdges(entities, relations, entityConfigMap) {
  const edges = [];
  const edgeSet = new Set();

  // Build index of entities by type and PK
  const entityIndex = new Map(); // Map<entityType, Map<pkValue, entityId>>

  for (const entity of entities) {
    if (!entityIndex.has(entity.type)) {
      entityIndex.set(entity.type, new Map());
    }
    entityIndex.get(entity.type).set(String(entity.pk), entity.id);
  }

  // Process each relation
  for (const relation of relations) {
    const { from: fromType, to: toType, toFk, fromPk } = relation;

    if (!toFk) continue;

    const fromConfig = entityConfigMap[fromType];
    const fromEntities = entityIndex.get(fromType);
    const toEntities = entities.filter(e => e.type === toType);

    if (!fromEntities || toEntities.length === 0) continue;

    // For each "to" entity, find matching "from" entity via FK
    for (const toEntity of toEntities) {
      const fkValue = evaluatePathSingle(toEntity.data, toFk);

      if (fkValue === undefined || fkValue === null) continue;

      const fromEntityId = fromEntities.get(String(fkValue));

      if (fromEntityId) {
        const edgeId = `inter-${fromEntityId}-${toEntity.id}`;

        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: fromEntityId,
            target: toEntity.id,
            edgeType: 'inter',
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Check if any call has extractions defined
 */
export function hasAnyExtractions() {
  const calls = callsStore.getAllCalls();
  return calls.some(call => call.extractions && call.extractions.length > 0);
}

/**
 * Get extraction stats
 */
export function getExtractionStats() {
  const { entities, intraEdges, interEdges } = extractAllEntities();

  // Count by type
  const byType = {};
  for (const entity of entities) {
    byType[entity.type] = (byType[entity.type] || 0) + 1;
  }

  return {
    totalEntities: entities.length,
    totalIntraEdges: intraEdges.length,
    totalInterEdges: interEdges.length,
    byType,
  };
}
