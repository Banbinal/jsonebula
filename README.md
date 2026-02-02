# json-nebula

A visual JSON explorer that transforms API responses into interactive knowledge graphs.

## Features

- **Multi-call support**: Paste multiple JSON payloads (API responses) as separate "calls"
- **Entity extraction**: Define entities with JSONPath-like paths to extract structured data
- **Entity merging**: Automatically merge identical entities (same type + primary key) across calls
- **Conflict detection**: Track and visualize when the same property has different values across sources
- **Relation mapping**: Define FK relationships between entities
- **Interactive graph**: Cytoscape.js-powered visualization with focus mode, path finding, and filtering
- **Smart flattening**: Intelligent conversion of nested JSON to graph nodes
- **Persistence**: Auto-save to localStorage

## Quick Start

1. Open `index.html` in a browser
2. Paste JSON in the left editor, or click "Example" to load sample data
3. Open "Mapping" to define entities and extractions
4. Explore the graph - click nodes for details, right-click for context menu

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New call |
| `Ctrl+W` | Close active call |
| `Ctrl+B` | Toggle left panel |
| `Ctrl+E` | Export session |
| `Escape` | Close sidebar / Exit focus mode |
| `F` or `/` | Focus search bar |

## Tech Stack

- **Cytoscape.js** - Graph visualization
- **CodeMirror** - JSON editor
- **Vanilla JS** - No framework dependencies

## Browser Support

Modern browsers with ES modules support (Chrome, Firefox, Edge, Safari).

## License

MIT
