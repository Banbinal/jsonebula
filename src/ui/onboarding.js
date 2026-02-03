/**
 * Onboarding guided tour
 */

const STORAGE_KEY = 'jsonebula-onboarded';

const STEPS = [
  {
    target: '#left-panel',
    title: 'API Calls',
    text: 'Add your API calls here. Each call holds a JSON response that will be visualized in the graph.',
    position: 'right',
  },
  {
    target: '.editor-section',
    title: 'JSON Editor',
    text: 'Paste or edit JSON responses. The graph updates automatically as you type.',
    position: 'right',
  },
  {
    target: '#btn-mapping',
    title: 'Mapping Configuration',
    text: 'Define entities, primary keys, and relations. This is where you tell jsonebula how to interpret your data.',
    position: 'bottom',
  },
  {
    target: '.query-bar',
    title: 'Search',
    text: 'Query your graph with expressions like client.status = "active". Matching nodes are highlighted, others are dimmed.',
    position: 'bottom',
  },
  {
    target: '#quick-filters',
    title: 'Quick Filters',
    text: 'One-click filters to show only mapped entities, orphan nodes, or highly connected hubs.',
    position: 'bottom',
  },
  {
    target: '#graph-container',
    title: 'Knowledge Graph',
    text: 'Your JSON data visualized as an interactive graph. Drag to pan, scroll to zoom. Click a node to see its details in the sidebar.',
    position: 'left',
  },
  {
    target: '#graph-container',
    title: 'Focus Mode',
    text: 'Right-click any node and select "Focus on this" to enter focus mode. It isolates the node and its neighborhood, with a depth slider to control how far to explore.',
    position: 'left',
  },
  {
    target: '.local-badge',
    title: 'Privacy First',
    text: 'All processing happens in your browser. Your data never leaves your device.',
    position: 'left',
  },
];

let currentStep = -1;
let backdropEl = null;
let cardEl = null;
let onComplete = null;

/**
 * Check if user has completed onboarding
 */
export function hasCompletedOnboarding() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Start the onboarding tour
 * @param {Object} options
 * @param {Function} options.onComplete - Called when tour finishes or is skipped
 */
export function startOnboarding(options = {}) {
  onComplete = options.onComplete || null;

  // Create backdrop
  backdropEl = document.createElement('div');
  backdropEl.className = 'onboarding-backdrop';
  document.body.appendChild(backdropEl);

  // Create card
  cardEl = document.createElement('div');
  cardEl.className = 'onboarding-card';
  document.body.appendChild(cardEl);

  currentStep = -1;
  nextStep();
}

function nextStep() {
  currentStep++;

  if (currentStep >= STEPS.length) {
    finish();
    return;
  }

  showStep(STEPS[currentStep]);
}

function prevStep() {
  if (currentStep <= 0) return;
  currentStep--;
  showStep(STEPS[currentStep]);
}

function showStep(step) {
  const target = document.querySelector(step.target);
  if (!target) {
    nextStep();
    return;
  }

  // Update spotlight
  const rect = target.getBoundingClientRect();
  const pad = 8;
  backdropEl.style.clipPath = `polygon(
    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
    ${rect.left - pad}px ${rect.top - pad}px,
    ${rect.left - pad}px ${rect.bottom + pad}px,
    ${rect.right + pad}px ${rect.bottom + pad}px,
    ${rect.right + pad}px ${rect.top - pad}px,
    ${rect.left - pad}px ${rect.top - pad}px
  )`;

  // Build card content
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  cardEl.innerHTML = `
    <div class="onboarding-header">
      <span class="onboarding-step-count">${currentStep + 1} / ${STEPS.length}</span>
      <button class="onboarding-skip">Skip</button>
    </div>
    <h3 class="onboarding-title">${step.title}</h3>
    <p class="onboarding-text">${step.text}</p>
    <div class="onboarding-nav">
      ${!isFirst ? '<button class="onboarding-btn onboarding-btn-back">Back</button>' : '<span></span>'}
      <button class="onboarding-btn onboarding-btn-next">${isLast ? 'Done' : 'Next'}</button>
    </div>
  `;

  // Position card
  positionCard(rect, step.position);

  // Bind handlers
  cardEl.querySelector('.onboarding-skip')?.addEventListener('click', finish);
  cardEl.querySelector('.onboarding-btn-next')?.addEventListener('click', nextStep);
  cardEl.querySelector('.onboarding-btn-back')?.addEventListener('click', prevStep);
}

function positionCard(targetRect, position) {
  // Reset
  cardEl.style.left = '';
  cardEl.style.top = '';
  cardEl.style.right = '';
  cardEl.style.bottom = '';

  // Render to get dimensions
  cardEl.style.visibility = 'hidden';
  cardEl.style.display = 'block';
  const cw = cardEl.offsetWidth;
  const ch = cardEl.offsetHeight;
  cardEl.style.visibility = '';

  const gap = 16;
  let x, y;

  switch (position) {
    case 'right':
      x = targetRect.right + gap;
      y = targetRect.top + targetRect.height / 2 - ch / 2;
      break;
    case 'left':
      x = targetRect.left - cw - gap;
      y = targetRect.top + targetRect.height / 2 - ch / 2;
      break;
    case 'bottom':
      x = targetRect.left + targetRect.width / 2 - cw / 2;
      y = targetRect.bottom + gap;
      break;
    case 'top':
      x = targetRect.left + targetRect.width / 2 - cw / 2;
      y = targetRect.top - ch - gap;
      break;
  }

  // Clamp to viewport
  x = Math.max(8, Math.min(x, window.innerWidth - cw - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - ch - 8));

  cardEl.style.left = x + 'px';
  cardEl.style.top = y + 'px';
}

function finish() {
  localStorage.setItem(STORAGE_KEY, '1');

  if (backdropEl) {
    backdropEl.remove();
    backdropEl = null;
  }
  if (cardEl) {
    cardEl.remove();
    cardEl = null;
  }

  currentStep = -1;

  if (onComplete) {
    onComplete();
  }
}
