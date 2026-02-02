/**
 * Path Parser
 *
 * Parses path strings into AST and evaluates them against JSON data.
 *
 * Supported syntax:
 *   $           - Root (works for both object and array)
 *   field       - Access a field
 *   parent.child - Nested access
 *   array[*]    - All elements of an array
 *   array[0]    - Specific index
 *   Combinations: data[*].items[*].name
 */

/**
 * Token types
 */
const TokenType = {
  ROOT: 'ROOT',           // $
  FIELD: 'FIELD',         // fieldName
  ALL_ITEMS: 'ALL_ITEMS', // [*]
  INDEX: 'INDEX',         // [0], [1], etc.
};

/**
 * Parse a path string into an AST (array of tokens)
 * @param {string} pathStr - Path string (e.g., "client.contacts[*].email")
 * @returns {Array<{ type: string, value?: string|number }>}
 */
export function parsePath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return [{ type: TokenType.ROOT }];
  }

  const trimmed = pathStr.trim();

  // Handle root
  if (trimmed === '$' || trimmed === '') {
    return [{ type: TokenType.ROOT }];
  }

  const tokens = [];
  let remaining = trimmed;

  // If starts with $, consume it
  if (remaining.startsWith('$')) {
    tokens.push({ type: TokenType.ROOT });
    remaining = remaining.slice(1);
    if (remaining.startsWith('.')) {
      remaining = remaining.slice(1);
    }
  }

  // Parse remaining segments
  while (remaining.length > 0) {
    // Handle array accessor [*] or [n]
    if (remaining.startsWith('[')) {
      const closeIdx = remaining.indexOf(']');
      if (closeIdx === -1) {
        throw new Error(`Invalid path: unclosed bracket in "${pathStr}"`);
      }

      const inside = remaining.slice(1, closeIdx);

      if (inside === '*') {
        tokens.push({ type: TokenType.ALL_ITEMS });
      } else if (/^\d+$/.test(inside)) {
        tokens.push({ type: TokenType.INDEX, value: parseInt(inside, 10) });
      } else {
        throw new Error(`Invalid array accessor: [${inside}] in "${pathStr}"`);
      }

      remaining = remaining.slice(closeIdx + 1);

      // Consume trailing dot if present
      if (remaining.startsWith('.')) {
        remaining = remaining.slice(1);
      }
      continue;
    }

    // Handle numeric index in dot notation (e.g., $.0 or $.contacts.0)
    const numMatch = remaining.match(/^(\d+)/);
    if (numMatch) {
      tokens.push({ type: TokenType.INDEX, value: parseInt(numMatch[1], 10) });
      remaining = remaining.slice(numMatch[1].length);

      // Consume trailing dot if present
      if (remaining.startsWith('.') && remaining.length > 1) {
        remaining = remaining.slice(1);
      } else if (remaining === '.') {
        remaining = '';
      }
      continue;
    }

    // Handle field name (allow hyphens and other common characters in JSON keys)
    const match = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)/);
    if (match) {
      tokens.push({ type: TokenType.FIELD, value: match[1] });
      remaining = remaining.slice(match[1].length);

      // Consume trailing dot if present (and not followed by nothing)
      if (remaining.startsWith('.') && remaining.length > 1) {
        remaining = remaining.slice(1);
      } else if (remaining === '.') {
        remaining = '';
      }
      continue;
    }

    // Skip dots
    if (remaining.startsWith('.')) {
      remaining = remaining.slice(1);
      continue;
    }

    throw new Error(`Invalid path syntax at "${remaining}" in "${pathStr}"`);
  }

  // If no tokens, treat as root
  if (tokens.length === 0) {
    tokens.push({ type: TokenType.ROOT });
  }

  return tokens;
}

/**
 * Evaluate a path against data, returning all matching values with their paths
 * @param {*} data - JSON data
 * @param {string|Array} pathOrAst - Path string or parsed path AST
 * @returns {Array<{ value: *, path: Array<string|number> }>} Array of matches with their paths
 */
export function evaluatePath(data, pathOrAst) {
  const ast = typeof pathOrAst === 'string' ? parsePath(pathOrAst) : pathOrAst;

  if (!ast || ast.length === 0) {
    return [{ value: data, path: [] }];
  }

  let results = [{ value: data, path: [] }];

  for (const token of ast) {
    const nextResults = [];

    for (const { value, path } of results) {
      switch (token.type) {
        case TokenType.ROOT:
          // Root: just return the value as-is (array or object)
          // Use [*] to expand arrays, not $
          {
            nextResults.push({ value, path });
          }
          break;

        case TokenType.FIELD:
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (token.value in value) {
              nextResults.push({
                value: value[token.value],
                path: [...path, token.value],
              });
            }
          }
          break;

        case TokenType.ALL_ITEMS:
          if (Array.isArray(value)) {
            value.forEach((item, idx) => {
              nextResults.push({ value: item, path: [...path, idx] });
            });
          }
          break;

        case TokenType.INDEX:
          if (Array.isArray(value) && token.value < value.length) {
            nextResults.push({
              value: value[token.value],
              path: [...path, token.value],
            });
          }
          break;
      }
    }

    results = nextResults;
  }

  return results;
}

/**
 * Evaluate a path and return just the values (no path info)
 * @param {*} data - JSON data
 * @param {string|Array} pathOrAst - Path string or parsed AST
 * @returns {Array<*>} Array of matched values
 */
export function evaluatePathValues(data, pathOrAst) {
  const ast = typeof pathOrAst === 'string' ? parsePath(pathOrAst) : pathOrAst;
  return evaluatePath(data, ast).map(r => r.value);
}

/**
 * Evaluate a path and return the first value (or undefined)
 * @param {*} data - JSON data
 * @param {string|Array} pathOrAst - Path string or parsed AST
 * @returns {*} First matched value or undefined
 */
export function evaluatePathSingle(data, pathOrAst) {
  const values = evaluatePathValues(data, pathOrAst);
  return values.length > 0 ? values[0] : undefined;
}

/**
 * Get the depth of a path (number of segments)
 * Used to determine parent-child relationships during extraction
 * @param {string|Array} pathOrAst - Path string or parsed AST
 * @returns {number} Depth
 */
export function getPathDepth(pathOrAst) {
  const ast = typeof pathOrAst === 'string' ? parsePath(pathOrAst) : pathOrAst;

  let depth = 0;
  for (const token of ast) {
    if (token.type === TokenType.FIELD) {
      depth++;
    } else if (token.type === TokenType.ALL_ITEMS || token.type === TokenType.INDEX) {
      depth++;
    }
    // ROOT doesn't add depth
  }
  return depth;
}

/**
 * Check if pathA is a parent of pathB (pathB starts with pathA)
 * @param {string} pathA - Potential parent path
 * @param {string} pathB - Potential child path
 * @returns {boolean}
 */
export function isParentPath(pathA, pathB) {
  // Normalize paths
  const normA = pathA === '$' ? '' : pathA.replace(/^\$\.?/, '');
  const normB = pathB === '$' ? '' : pathB.replace(/^\$\.?/, '');

  // Root is parent of everything (except itself)
  if (normA === '' && normB !== '') {
    return true;
  }

  // Check if B starts with A
  if (normB.startsWith(normA)) {
    const remainder = normB.slice(normA.length);
    // Must be followed by . or [ or end
    return remainder === '' || remainder.startsWith('.') || remainder.startsWith('[');
  }

  return false;
}

/**
 * Get the parent path of a given path
 * @param {string} path - Path string
 * @returns {string|null} Parent path or null if root
 */
export function getParentPath(path) {
  if (!path || path === '$') {
    return null;
  }

  const normalized = path.replace(/^\$\.?/, '');
  if (!normalized) {
    return null;
  }

  // Remove last segment
  // Handle: field, array[*], array[0]
  const lastDot = normalized.lastIndexOf('.');
  const lastBracket = normalized.lastIndexOf('[');

  if (lastDot === -1 && lastBracket === -1) {
    return '$';
  }

  const cutPoint = Math.max(lastDot, lastBracket);
  const parent = normalized.slice(0, cutPoint);

  return parent || '$';
}

// Export token types for testing
export { TokenType };
