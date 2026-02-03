/**
 * Path Picker (V5)
 *
 * Analyzes JSON structure and suggests extractable paths.
 * Shows a tree view of objects and arrays that can be extracted as entities.
 */

import { callsStore } from '../../calls/store.js';
import { mappingStore } from '../../mapping/store.js';

/**
 * Analyze JSON and find extractable paths
 * @param {*} json - Parsed JSON
 * @param {string} basePath - Current path prefix
 * @param {number} depth - Current depth
 * @returns {Array<{ path: string, type: string, sample: Object, count: number }>}
 */
export function findExtractablePaths(json, basePath = '$', depth = 0) {
  const paths = [];
  const MAX_DEPTH = 5;

  if (depth > MAX_DEPTH) return paths;

  if (json === null || json === undefined) return paths;

  // Handle arrays
  if (Array.isArray(json)) {
    if (json.length > 0 && typeof json[0] === 'object' && json[0] !== null) {
      // Array container - the list itself (e.g., $.contacts)
      paths.push({
        path: basePath,
        type: 'list',
        sample: json,
        count: 1,
        fields: [`${json.length} items`],
        hasId: false,
      });

      // Array items - each object in the array (e.g., $.contacts[*])
      paths.push({
        path: basePath + '[*]',
        type: 'array',
        sample: json[0],
        count: json.length,
        fields: Object.keys(json[0]),
        hasId: 'id' in json[0] || Object.keys(json[0]).some(k => k.endsWith('_id') || k.endsWith('Id')),
      });

      // Recurse into sampled items to discover nested extractables
      // (handles heterogeneous arrays where only some items have nested structures)
      const sampleSize = Math.min(json.length, 20);
      const seenPaths = new Set(paths.map(p => p.path));
      for (let i = 0; i < sampleSize; i++) {
        if (typeof json[i] !== 'object' || json[i] === null) continue;
        const nested = findExtractablePaths(json[i], basePath + '[*]', depth + 1);
        for (const p of nested) {
          if (!seenPaths.has(p.path)) {
            seenPaths.add(p.path);
            paths.push(p);
          }
        }
      }
    }
    return paths;
  }

  // Handle objects
  if (typeof json === 'object') {
    // Root object is extractable
    if (basePath === '$') {
      paths.push({
        path: '$',
        type: 'object',
        sample: json,
        count: 1,
        fields: Object.keys(json).filter(k => typeof json[k] !== 'object' || json[k] === null),
        hasId: 'id' in json || Object.keys(json).some(k => k.endsWith('_id') || k.endsWith('Id')),
      });
    }

    // Check each field for nested extractables
    for (const [key, value] of Object.entries(json)) {
      if (value === null) continue;

      const childPath = basePath === '$' ? `$.${key}` : `${basePath}.${key}`;

      if (Array.isArray(value)) {
        // Array field
        const nested = findExtractablePaths(value, childPath, depth + 1);
        paths.push(...nested);
      } else if (typeof value === 'object') {
        // Nested object - could be extractable
        paths.push({
          path: childPath,
          type: 'object',
          sample: value,
          count: 1,
          fields: Object.keys(value).filter(k => typeof value[k] !== 'object' || value[k] === null),
          hasId: 'id' in value,
        });

        // Recurse
        const nested = findExtractablePaths(value, childPath, depth + 1);
        paths.push(...nested);
      }
    }
  }

  return paths;
}

/**
 * Render extractable paths for a call
 * @param {string} callId - Call ID
 * @returns {string} HTML
 */
export function renderExtractablePaths(callId) {
  const call = callsStore.getCall(callId);
  if (!call || !call.parsedJson) {
    return '<div class="empty-state"><p>No valid JSON in this call.</p></div>';
  }

  const allPaths = findExtractablePaths(call.parsedJson);

  // Filter out already extracted paths
  const extractedPaths = new Set((call.extractions || []).map(e => e.path));
  const paths = allPaths.filter(p => !extractedPaths.has(p.path));

  if (paths.length === 0) {
    return '<div class="empty-state"><p>All paths have been extracted.</p></div>';
  }

  return `
    <div class="path-picker-header-actions">
      <button class="btn btn-small btn-extract-all" id="btn-extract-all">
        Extract All (${paths.length})
      </button>
    </div>
    <div class="path-picker-list">
      ${paths.map(p => `
        <div class="path-picker-item" data-path="${escapeAttr(p.path)}">
          <div class="path-picker-header">
            <span class="path-picker-icon">${p.type === 'list' ? '[...]' : p.type === 'array' ? '[]' : '{}'}</span>
            <code class="path-picker-path">${escapeHtml(p.path)}</code>
            ${p.type === 'array' && p.count > 1 ? `<span class="path-picker-count">${p.count} items</span>` : ''}
            ${p.type === 'list' ? '<span class="path-picker-badge list">list</span>' : ''}
            ${p.hasId ? '<span class="path-picker-badge">has id</span>' : ''}
          </div>
          <div class="path-picker-fields">
            ${p.fields.slice(0, 5).map(f => `<span class="field-chip">${escapeHtml(f)}</span>`).join('')}
            ${p.fields.length > 5 ? `<span class="field-chip more">+${p.fields.length - 5}</span>` : ''}
          </div>
          <div class="path-picker-actions">
            <button class="btn btn-small btn-extract" data-path="${escapeAttr(p.path)}" data-type="${p.type}" data-sample='${escapeAttr(JSON.stringify(p.sample))}'>
              + Extract as Entity
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Suggest entity name from path
 */
export function suggestEntityName(path, type = null) {
  // Check if path ends with [*] (array extraction)
  const isArrayExtraction = path.endsWith('[*]');

  // Remove array notation for analysis
  const cleanPath = path.replace(/\[\*\]/g, '').replace(/\[\d+\]/g, '');
  const parts = cleanPath.split('.').filter(p => p && p !== '$');

  if (parts.length === 0) {
    return type === 'list' ? 'rootList' : 'root';
  }

  const last = parts[parts.length - 1];

  // For list type (the array container), use "listOf{Name}"
  if (type === 'list') {
    return 'listOf' + capitalize(last);
  }

  // For array extractions ($.things[*]), singularize the array name
  if (isArrayExtraction) {
    return singularize(last).toLowerCase();
  }

  // For nested objects ($.things[*].field), check context
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    const parentSingular = singularize(parent).toLowerCase();
    const fieldName = last.toLowerCase();

    // If field name is same/similar to parent, add "Detail" suffix
    // e.g., abilities[*].ability -> abilityDetail
    if (fieldName === parentSingular ||
        parentSingular.startsWith(fieldName) ||
        fieldName.startsWith(parentSingular)) {
      return fieldName + 'Detail';
    }

    // Otherwise just use the field name
    return fieldName;
  }

  return singularize(last).toLowerCase();
}

/**
 * Singularize a word (basic implementation)
 */
function singularize(word) {
  if (!word) return word;

  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  } else if (word.endsWith('es') && !word.endsWith('ss')) {
    return word.slice(0, -2);
  } else if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Suggest display field from sample object
 */
export function suggestDisplayField(sample) {
  if (!sample || typeof sample !== 'object') return 'id';

  // Priority order for display fields
  const priorities = ['name', 'title', 'label', 'fullName', 'displayName', 'description', 'numero', 'reference', 'email', 'id'];

  for (const field of priorities) {
    if (field in sample && typeof sample[field] === 'string') {
      return field;
    }
  }

  // Find first string field
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === 'string' && !key.endsWith('_id') && !key.endsWith('Id')) {
      return key;
    }
  }

  return 'id';
}

/**
 * Suggest PK field from sample object
 */
export function suggestPkField(sample) {
  if (!sample || typeof sample !== 'object') return 'id';

  if ('id' in sample) return 'id';

  // Look for *_id or *Id fields
  for (const key of Object.keys(sample)) {
    if (key === 'id' || key.endsWith('_id') || key.endsWith('Id')) {
      return key;
    }
  }

  return 'id';
}

/**
 * Create or reuse entity for extraction path
 * If entity with suggested name exists, reuse it. Otherwise create new.
 */
export function createEntityFromPath(path, sample, type = null) {
  const name = suggestEntityName(path, type);

  // Check if entity already exists
  const existingEntity = mappingStore.getEntity(name);

  if (!existingEntity) {
    // Create new entity
    const isListType = type === 'list';
    const itemSample = isListType && Array.isArray(sample) && sample.length > 0 ? sample[0] : sample;

    const pk = isListType ? '' : suggestPkField(itemSample);
    const displayField = isListType ? '' : suggestDisplayField(itemSample);

    // Generate human-readable label
    let label;
    if (isListType && name.startsWith('listOf')) {
      const itemName = name.slice(6);
      label = 'List of ' + capitalize(itemName);
    } else {
      label = capitalize(name);
    }

    mappingStore.setEntity(name, {
      label,
      pk,
      displayField,
    });

    // Auto-create relations based on path nesting
    autoCreateRelations(name, path, itemSample);
  }

  return {
    entityId: name,
    path,
  };
}

/**
 * Auto-create relations between entities based on path nesting
 * Only creates relations with IMMEDIATE parent/children, not all ancestors/descendants
 */
function autoCreateRelations(newEntityId, newPath, sample) {
  const calls = callsStore.getAllCalls();
  const existingRelations = mappingStore.getRelations();

  // Collect all existing extractions with their entity IDs and paths
  const existingExtractions = [];
  for (const call of calls) {
    if (!call.extractions) continue;
    for (const ext of call.extractions) {
      if (ext.entity && ext.path) {
        existingExtractions.push({
          entityId: ext.entity,
          path: ext.path,
        });
      }
    }
  }

  // Normalize path for comparison (remove $ prefix)
  const normalizePath = (p) => p === '$' ? '' : p.replace(/^\$\.?/, '');
  const newNorm = normalizePath(newPath);

  // Find all parents and children
  const parents = [];
  const children = [];

  for (const existing of existingExtractions) {
    if (existing.entityId === newEntityId) continue;

    const existingNorm = normalizePath(existing.path);

    if (isParentOf(existingNorm, newNorm)) {
      parents.push({ ...existing, normPath: existingNorm });
    }

    if (isParentOf(newNorm, existingNorm)) {
      children.push({ ...existing, normPath: existingNorm });
    }
  }

  // Only connect to the CLOSEST parent (longest path = most specific)
  if (parents.length > 0) {
    parents.sort((a, b) => b.normPath.length - a.normPath.length);
    const closestParent = parents[0];

    const relationExists = existingRelations.some(r =>
      r.from === closestParent.entityId && r.to === newEntityId
    );

    if (!relationExists) {
      const fk = suggestFkField(sample, closestParent.entityId);
      mappingStore.addRelation(closestParent.entityId, newEntityId, fk);
    }
  }

  // Only connect to IMMEDIATE children (filter out children that have a closer parent in our extraction set)
  for (const child of children) {
    // Check if there's another extraction between newPath and this child
    const hasCloserParent = children.some(other =>
      other.entityId !== child.entityId &&
      isParentOf(newNorm, other.normPath) &&
      isParentOf(other.normPath, child.normPath)
    );

    if (!hasCloserParent) {
      const relationExists = existingRelations.some(r =>
        r.from === newEntityId && r.to === child.entityId
      );

      if (!relationExists) {
        mappingStore.addRelation(newEntityId, child.entityId, '');
      }

      // Remove any "skip" relations from our parents directly to this child
      // (since we're now in between)
      for (const parent of parents) {
        mappingStore.removeRelation(parent.entityId, child.entityId);
      }
    }
  }
}

/**
 * Check if pathA is parent of pathB
 */
function isParentOf(parentNorm, childNorm) {
  if (parentNorm === '' && childNorm !== '') {
    // Root is parent of everything
    return true;
  }
  if (childNorm.startsWith(parentNorm)) {
    const remainder = childNorm.slice(parentNorm.length);
    // Must be followed by . or [ to be a true parent
    return remainder.startsWith('.') || remainder.startsWith('[');
  }
  return false;
}

/**
 * Suggest FK field that might reference a parent entity
 */
function suggestFkField(sample, parentEntityId) {
  if (!sample || typeof sample !== 'object') return '';

  // Look for field named {parent}_id or {parent}Id
  const patterns = [
    `${parentEntityId}_id`,
    `${parentEntityId}Id`,
    `${parentEntityId.toLowerCase()}_id`,
    `${parentEntityId.toLowerCase()}Id`,
  ];

  for (const pattern of patterns) {
    if (pattern in sample) {
      return pattern;
    }
  }

  return '';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
