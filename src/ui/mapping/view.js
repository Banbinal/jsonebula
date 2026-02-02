/**
 * Mapping View V4
 *
 * Main orchestrator for the Mapping view with 3 tabs:
 * - Entities: Define entity types (pk, displayField, color)
 * - API Calls: Define API call types with extraction paths
 * - Relations: Define FK relationships between entities
 */

import { initEntityList } from './entities.js';
import { initApiCallsList } from './api-calls.js';
import { initRelationsList } from './relations.js';
import { initSchemaGraph } from './graph.js';
import { initConfigOutput } from './dsl.js';

let initialized = false;

/**
 * Initialize the Mapping view
 */
export function initMappingView() {
  if (initialized) {
    console.warn('Mapping view already initialized');
    return;
  }

  // Initialize tab switching
  initMappingTabs();

  // Initialize sub-components
  initEntityList();
  initApiCallsList();
  initRelationsList();
  initSchemaGraph();
  initConfigOutput();

  initialized = true;
}

/**
 * Initialize mapping sub-tab switching
 */
function initMappingTabs() {
  const tabs = document.querySelectorAll('.mapping-sub-tabs .sub-tab');
  const contents = document.querySelectorAll('.mapping-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.mappingTab;

      // Update tab buttons
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update tab contents
      contents.forEach(content => {
        const isTarget = content.id === `tab-${targetTab}`;
        content.classList.toggle('active', isTarget);
      });
    });
  });
}

/**
 * Called when switching to Mapping view
 */
export function onMappingViewActivate() {
  // Trigger graph resize/layout
  window.dispatchEvent(new Event('resize'));
}
