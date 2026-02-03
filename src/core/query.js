/**
 * Query Module
 *
 * Translates user-friendly query syntax to native Cytoscape selectors.
 * Leverages Cytoscape's powerful built-in selector engine.
 *
 * Supported syntax:
 *   entity.path = "value"      - exact match
 *   entity.path != "value"     - not equal
 *   entity.path > 100          - greater than
 *   entity.path >= 100         - greater or equal
 *   entity.path < 100          - less than
 *   entity.path <= 100         - less or equal
 *   entity.path *= "text"      - contains
 *   entity.path ^= "prefix"    - starts with
 *   entity.path $= "suffix"    - ends with
 *   *.path = "value"           - any entity type
 *
 * Multiple conditions:
 *   AND: entity.path = "a" AND entity.other = "b"
 *   OR:  entity.path = "a" OR other.path = "b"
 */

// Supported operators mapped to Cytoscape selector operators
const OPERATORS = {
  '=': '=',
  '==': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  '*=': '*=',   // contains
  '^=': '^=',   // starts with
  '$=': '$=',   // ends with
  '@=': '@=',   // regex match
};

// Pattern to match a single condition
// Captures: entity, path, operator, value
const CONDITION_PATTERN = /^(\w+|\*)\.([\w.]+)\s*(=|==|!=|>=?|<=?|\*=|\^=|\$=|@=)\s*(.+)$/;

/**
 * Parse a single condition into its components
 * @param {string} condition - e.g. 'client.status = "active"'
 * @returns {Object|null} Parsed condition or null if invalid
 */
function parseCondition(condition) {
  const trimmed = condition.trim();
  const match = trimmed.match(CONDITION_PATTERN);

  if (!match) return null;

  const [, entity, path, operator, rawValue] = match;

  // Normalize the value (handle quoted strings vs numbers)
  let value = rawValue.trim();

  // Check if it's a quoted string
  const stringMatch = value.match(/^["'](.*)["']$/);
  if (stringMatch) {
    value = `"${stringMatch[1]}"`;
  } else if (!isNaN(Number(value))) {
    // It's a number - keep as-is for Cytoscape
    value = value;
  } else {
    // Unquoted string - add quotes
    value = `"${value}"`;
  }

  return {
    entity,
    path,
    operator: OPERATORS[operator] || '=',
    value,
  };
}

/**
 * Convert a parsed condition to a Cytoscape selector fragment
 * @param {Object} condition - Parsed condition
 * @returns {string} Cytoscape selector
 */
function conditionToSelector(condition) {
  const { entity, path, operator, value } = condition;

  let selector = 'node';

  // Add entity type filter (skip for wildcard)
  if (entity !== '*') {
    selector += `[entityType = "${entity}"]`;
  }

  // Convert dotted path to internal format (version.name -> version__name)
  // This matches how nested objects are flattened in raw.js
  const internalPath = path.replace(/\./g, '__');

  // Add the data condition
  selector += `[primitives.${internalPath} ${operator} ${value}]`;

  return selector;
}

/**
 * Convert user query to Cytoscape selector
 * Supports AND/OR combinations
 *
 * @param {string} query - User query string
 * @returns {Object} { selector: string, error: string|null }
 */
export function queryToSelector(query) {
  if (!query || !query.trim()) {
    return { selector: null, error: null };
  }

  const trimmed = query.trim();

  // Handle OR conditions (split by ' OR ')
  if (trimmed.toUpperCase().includes(' OR ')) {
    const orParts = trimmed.split(/\s+OR\s+/i);
    const selectors = [];

    for (const part of orParts) {
      const result = queryToSelector(part);
      if (result.error) return result;
      if (result.selector) selectors.push(result.selector);
    }

    return {
      selector: selectors.join(', '), // Cytoscape OR is comma-separated
      error: null
    };
  }

  // Handle AND conditions (split by ' AND ')
  if (trimmed.toUpperCase().includes(' AND ')) {
    const andParts = trimmed.split(/\s+AND\s+/i);
    const conditions = [];

    for (const part of andParts) {
      const parsed = parseCondition(part);
      if (!parsed) {
        return { selector: null, error: `Invalid condition: "${part}"` };
      }
      conditions.push(parsed);
    }

    // For AND, we need all conditions on the same node
    // Build selector with chained attribute selectors
    let selector = 'node';
    const entityType = conditions[0].entity;

    // If first condition has entity type, add it once
    if (entityType !== '*') {
      selector += `[entityType = "${entityType}"]`;
    }

    // Add all data conditions
    for (const cond of conditions) {
      selector += `[primitives.${cond.path} ${cond.operator} ${cond.value}]`;
    }

    return { selector, error: null };
  }

  // Single condition
  const parsed = parseCondition(trimmed);
  if (!parsed) {
    return { selector: null, error: `Invalid query syntax: "${trimmed}"` };
  }

  return { selector: conditionToSelector(parsed), error: null };
}

/**
 * Execute a query on the Cytoscape instance
 *
 * @param {Object} cy - Cytoscape instance
 * @param {string} query - User query string
 * @returns {Object} { matches: Collection, count: number, error: string|null }
 */
export function executeQuery(cy, query) {
  if (!cy) {
    return { matches: null, count: 0, error: 'No graph instance' };
  }

  const { selector, error } = queryToSelector(query);

  if (error) {
    return { matches: null, count: 0, error };
  }

  if (!selector) {
    return { matches: null, count: 0, error: null };
  }

  try {
    const matches = cy.$(selector);
    return { matches, count: matches.length, error: null };
  } catch (e) {
    return { matches: null, count: 0, error: `Query error: ${e.message}` };
  }
}

/**
 * Apply query highlighting to the graph
 * Highlights matching nodes and dims non-matching ones
 *
 * @param {Object} cy - Cytoscape instance
 * @param {string} query - User query string
 * @returns {Object} { count: number, error: string|null }
 */
export function applyQueryHighlight(cy, query) {
  if (!cy) {
    return { count: 0, error: 'No graph instance' };
  }

  // Clear previous highlighting
  cy.nodes().removeClass('highlighted dimmed query-match');
  cy.edges().removeClass('highlighted dimmed');

  // Empty query = reset to normal
  if (!query || !query.trim()) {
    return { count: 0, error: null };
  }

  const { matches, count, error } = executeQuery(cy, query);

  if (error) {
    return { count: 0, error };
  }

  if (count === 0) {
    // Dim all nodes to indicate no results
    cy.nodes().not('[isCompound = "true"]').addClass('dimmed');
    cy.edges().addClass('dimmed');
    return { count: 0, error: null };
  }

  // Highlight matches
  matches.addClass('highlighted query-match');

  // Dim non-matches (excluding compound nodes)
  cy.nodes().not(matches).not('[isCompound = "true"]').addClass('dimmed');

  // Highlight edges between matched nodes
  cy.edges().forEach(edge => {
    const sourceMatched = matches.contains(edge.source());
    const targetMatched = matches.contains(edge.target());

    if (sourceMatched && targetMatched) {
      edge.addClass('highlighted');
    } else {
      edge.addClass('dimmed');
    }
  });

  return { count, error: null };
}

/**
 * Clear all query highlighting
 *
 * @param {Object} cy - Cytoscape instance
 */
export function clearQueryHighlight(cy) {
  if (!cy) return;

  cy.nodes().removeClass('highlighted dimmed query-match');
  cy.edges().removeClass('highlighted dimmed');
}

/**
 * Get query syntax help text
 * @returns {string} Help text
 */
export function getQueryHelp() {
  return `Query Syntax:

Basic:
  entity.field = "value"     Exact match
  entity.field != "value"    Not equal
  entity.field > 100         Greater than
  entity.field >= 100        Greater or equal
  entity.field < 100         Less than
  entity.field <= 100        Less or equal

Text:
  entity.field *= "text"     Contains
  entity.field ^= "prefix"   Starts with
  entity.field $= "suffix"   Ends with

Wildcards:
  *.field = "value"          Any entity type

Combine:
  cond1 AND cond2            Both must match
  cond1 OR cond2             Either must match

Examples:
  client.status = "active"
  *.email *= "@gmail.com"
  invoice.amount > 1000
  client.name ^= "Acme" AND client.status = "active"`;
}

/**
 * Extract available entity types and their fields from the graph
 * Used for autocomplete suggestions
 *
 * @param {Object} cy - Cytoscape instance
 * @returns {Object} { entities: [{ type, color, fields: [{ name, type }] }] }
 */
export function extractAutocompleteData(cy) {
  if (!cy) return { entities: [] };

  const entitiesMap = new Map();

  cy.nodes().forEach(node => {
    const data = node.data();

    // Skip compound nodes
    if (data.isCompound === 'true') return;

    const entityType = data.entityType;
    if (!entityType) return;

    // Get or create entity entry
    if (!entitiesMap.has(entityType)) {
      entitiesMap.set(entityType, {
        type: entityType,
        color: data.color || '#888',
        fields: new Map(),
      });
    }

    const entity = entitiesMap.get(entityType);

    // Collect fields from primitives
    // Convert internal format (version__name) to display format (version.name)
    const primitives = data.primitives || {};
    for (const [internalName, fieldValue] of Object.entries(primitives)) {
      const displayName = internalName.replace(/__/g, '.');
      if (!entity.fields.has(displayName)) {
        entity.fields.set(displayName, {
          name: displayName,
          type: typeof fieldValue,
          sample: fieldValue,
        });
      }
    }
  });

  // Convert to array format
  const entities = Array.from(entitiesMap.values()).map(entity => ({
    type: entity.type,
    color: entity.color,
    fields: Array.from(entity.fields.values()),
  }));

  return { entities };
}

/**
 * Apply a quick filter to the graph
 *
 * @param {Object} cy - Cytoscape instance
 * @param {string} filterType - 'mapped', 'orphans', 'hubs', or null to clear
 * @returns {Object} { count: number }
 */
export function applyQuickFilter(cy, filterType) {
  if (!cy) return { count: 0 };

  // Clear previous highlighting
  cy.nodes().removeClass('highlighted dimmed query-match');
  cy.edges().removeClass('highlighted dimmed');

  if (!filterType) {
    return { count: 0 };
  }

  let matches;

  switch (filterType) {
    case 'mapped':
      // Nodes with entityType (mapped to an entity)
      matches = cy.nodes('[entityType]').not('[isCompound = "true"]');
      break;

    case 'orphans':
      // Nodes with no connections (degree = 0)
      matches = cy.nodes().filter(node => {
        if (node.data('isCompound') === 'true') return false;
        return node.degree() === 0;
      });
      break;

    case 'hubs':
      // Nodes with more than 5 connections
      matches = cy.nodes().filter(node => {
        if (node.data('isCompound') === 'true') return false;
        return node.degree() > 5;
      });
      break;

    default:
      return { count: 0 };
  }

  const count = matches.length;

  if (count > 0) {
    matches.addClass('highlighted query-match');
    cy.nodes().not(matches).not('[isCompound = "true"]').addClass('dimmed');

    cy.edges().forEach(edge => {
      const sourceMatched = matches.contains(edge.source());
      const targetMatched = matches.contains(edge.target());
      if (sourceMatched && targetMatched) {
        edge.addClass('highlighted');
      } else {
        edge.addClass('dimmed');
      }
    });
  }

  return { count };
}

/**
 * Filter graph by entity type (from legend click)
 *
 * @param {Object} cy - Cytoscape instance
 * @param {string} entityType - Entity type to filter by, or null to clear
 * @returns {Object} { count: number }
 */
export function filterByEntityType(cy, entityType) {
  if (!cy) return { count: 0 };

  // Clear previous highlighting
  cy.nodes().removeClass('highlighted dimmed query-match');
  cy.edges().removeClass('highlighted dimmed');

  if (!entityType) {
    return { count: 0 };
  }

  const matches = cy.nodes(`[entityType = "${entityType}"]`);
  const count = matches.length;

  if (count > 0) {
    matches.addClass('highlighted query-match');
    cy.nodes().not(matches).not('[isCompound = "true"]').addClass('dimmed');

    cy.edges().forEach(edge => {
      const sourceMatched = matches.contains(edge.source());
      const targetMatched = matches.contains(edge.target());
      if (sourceMatched && targetMatched) {
        edge.addClass('highlighted');
      } else {
        edge.addClass('dimmed');
      }
    });
  }

  return { count };
}
