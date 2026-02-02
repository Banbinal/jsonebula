/**
 * Calls Store (V5)
 *
 * Manages JSON calls (tabs). Each call represents a pasted JSON payload.
 * - calls: Map of callId -> { name, json, extractions? }
 * - activeCallId: Currently selected call
 * - Persists to localStorage
 */

const STORAGE_KEY = 'json-nebula-calls';

/**
 * Generate unique call ID
 */
function generateCallId() {
  return `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create the calls store
 */
function createCallsStore() {
  // calls: Map<callId, { name, json, extractions?, parsedJson?, parseError? }>
  let calls = new Map();
  let activeCallId = null;
  let callCounter = 0;
  const listeners = new Set();
  let batchMode = false;
  let batchDirty = false;
  let batchEventType = 'change';

  /**
   * Notify all listeners of state change (skipped during batch mode)
   */
  function notifyListeners(eventType = 'change') {
    if (batchMode) {
      batchDirty = true;
      batchEventType = eventType;
      return;
    }
    const state = getState();
    listeners.forEach(cb => {
      try {
        cb(state, eventType);
      } catch (e) {
        console.error('Calls store listener error:', e);
      }
    });
  }

  /**
   * Get all calls as array (internal helper)
   */
  function getAllCallsInternal() {
    return Array.from(calls.entries()).map(([id, call]) => ({
      id,
      ...call,
    }));
  }

  /**
   * Get active call (internal helper)
   */
  function getActiveCallInternal() {
    if (!activeCallId) return null;
    const call = calls.get(activeCallId);
    if (!call) return null;
    return { id: activeCallId, ...call };
  }

  /**
   * Get current state
   */
  function getState() {
    return {
      calls: getAllCallsInternal(),
      activeCallId,
      activeCall: getActiveCallInternal(),
    };
  }

  /**
   * Save to localStorage
   * Skip persisting very large JSON to avoid slow page loads
   */
  const MAX_PERSIST_JSON_SIZE = 100000;  // 100KB per call max

  function persist() {
    try {
      const data = {
        calls: Array.from(calls.entries()).map(([id, call]) => {
          // Skip large JSON to avoid slow loads
          const jsonToPersist = (call.json && call.json.length > MAX_PERSIST_JSON_SIZE)
            ? ''  // Don't persist large JSON
            : call.json;

          return {
            id,
            name: call.name,
            json: jsonToPersist,
            extractions: call.extractions,
            wasLarge: call.json && call.json.length > MAX_PERSIST_JSON_SIZE,
          };
        }),
        activeCallId,
        callCounter,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to persist calls:', e);
    }
  }

  /**
   * Load from localStorage
   */
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;

      const data = JSON.parse(stored);
      calls.clear();

      for (const call of data.calls || []) {
        const parsedResult = tryParseJson(call.json);
        calls.set(call.id, {
          name: call.name,
          json: call.json,
          extractions: call.extractions,
          parsedJson: parsedResult.success ? parsedResult.data : null,
          parseError: parsedResult.success ? null : parsedResult.error,
        });
      }

      activeCallId = data.activeCallId;
      callCounter = data.callCounter || calls.size;

      // Validate activeCallId
      if (activeCallId && !calls.has(activeCallId)) {
        activeCallId = calls.size > 0 ? calls.keys().next().value : null;
      }

      return true;
    } catch (e) {
      console.error('Failed to load calls:', e);
      return false;
    }
  }

  /**
   * Try to parse JSON string
   */
  function tryParseJson(jsonString) {
    if (!jsonString || !jsonString.trim()) {
      return { success: true, data: null };
    }

    try {
      const data = JSON.parse(jsonString);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Generate next call name
   */
  function nextCallName() {
    callCounter++;
    return `Call ${callCounter}`;
  }

  return {
    /**
     * Initialize store (load from localStorage)
     */
    init() {
      const loaded = load();
      if (!loaded || calls.size === 0) {
        // Create initial empty call
        this.createCall();
      }
      notifyListeners('init');
    },

    /**
     * Create a new call
     * @param {string} name - Optional name
     * @param {string} json - Optional initial JSON
     * @returns {string} Call ID
     */
    createCall(name, json = '') {
      const callId = generateCallId();
      const callName = name || nextCallName();
      const parsedResult = tryParseJson(json);

      calls.set(callId, {
        name: callName,
        json,
        extractions: [],
        parsedJson: parsedResult.success ? parsedResult.data : null,
        parseError: parsedResult.success ? null : parsedResult.error,
      });

      // Auto-activate if first call
      if (calls.size === 1 || activeCallId === null) {
        activeCallId = callId;
      }

      persist();
      notifyListeners('callCreated');
      return callId;
    },

    /**
     * Update call JSON
     * @param {string} callId - Call ID
     * @param {string} json - New JSON string
     */
    updateJson(callId, json) {
      const call = calls.get(callId);
      if (!call) return;

      const parsedResult = tryParseJson(json);

      call.json = json;
      call.parsedJson = parsedResult.success ? parsedResult.data : null;
      call.parseError = parsedResult.success ? null : parsedResult.error;

      persist();
      notifyListeners('jsonUpdated');
    },

    /**
     * Update call name
     * @param {string} callId - Call ID
     * @param {string} name - New name
     */
    updateName(callId, name) {
      const call = calls.get(callId);
      if (!call) return;

      call.name = name;
      persist();
      notifyListeners('nameUpdated');
    },

    /**
     * Update call extractions
     * @param {string} callId - Call ID
     * @param {Array} extractions - Extraction configs
     */
    updateExtractions(callId, extractions) {
      const call = calls.get(callId);
      if (!call) return;

      call.extractions = extractions;
      persist();
      notifyListeners('extractionsUpdated');
    },

    /**
     * Delete a call
     * @param {string} callId - Call ID
     */
    deleteCall(callId) {
      if (!calls.has(callId)) return;

      calls.delete(callId);

      // Update active if needed
      if (activeCallId === callId) {
        activeCallId = calls.size > 0 ? calls.keys().next().value : null;
      }

      persist();
      notifyListeners('callDeleted');
    },

    /**
     * Set active call
     * @param {string} callId - Call ID
     */
    setActiveCall(callId) {
      if (!calls.has(callId)) return;

      activeCallId = callId;
      persist();
      notifyListeners('activeChanged');
    },

    /**
     * Get call by ID
     * @param {string} callId - Call ID
     * @returns {Object|null}
     */
    getCall(callId) {
      const call = calls.get(callId);
      if (!call) return null;

      return {
        id: callId,
        ...call,
      };
    },

    /**
     * Get all calls
     * @returns {Array}
     */
    getAllCalls() {
      return Array.from(calls.entries()).map(([id, call]) => ({
        id,
        ...call,
      }));
    },

    /**
     * Get active call
     * @returns {Object|null}
     */
    getActiveCall() {
      if (!activeCallId) return null;
      return this.getCall(activeCallId);
    },

    /**
     * Get active call ID
     * @returns {string|null}
     */
    getActiveCallId() {
      return activeCallId;
    },

    /**
     * Get call count
     * @returns {number}
     */
    getCallCount() {
      return calls.size;
    },

    /**
     * Check if call has valid JSON
     * @param {string} callId - Call ID
     * @returns {boolean}
     */
    hasValidJson(callId) {
      const call = calls.get(callId);
      return call && call.parsedJson !== null && call.parseError === null;
    },

    /**
     * Get parsed JSON for a call
     * @param {string} callId - Call ID
     * @returns {*}
     */
    getParsedJson(callId) {
      const call = calls.get(callId);
      return call ? call.parsedJson : null;
    },

    /**
     * Clear all calls
     */
    clearAll() {
      calls.clear();
      activeCallId = null;
      callCounter = 0;
      persist();
      notifyListeners('cleared');
    },

    /**
     * Subscribe to changes
     * @param {Function} callback - Callback(state, eventType)
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Start batch mode - suspends notifications until endBatch()
     */
    startBatch() {
      batchMode = true;
      batchDirty = false;
    },

    /**
     * End batch mode - notifies listeners if changes occurred
     */
    endBatch() {
      batchMode = false;
      if (batchDirty) {
        batchDirty = false;
        notifyListeners(batchEventType);
      }
    },

    /**
     * Get current state
     */
    getState,

    /**
     * Export all calls for save/share
     * @returns {Object}
     */
    exportData() {
      return {
        calls: Array.from(calls.entries()).map(([id, call]) => ({
          id,
          name: call.name,
          json: call.json,
          extractions: call.extractions,
        })),
        activeCallId,
      };
    },

    /**
     * Import calls from exported data
     * @param {Object} data - Exported data
     */
    importData(data) {
      calls.clear();
      callCounter = 0;

      for (const call of data.calls || []) {
        const parsedResult = tryParseJson(call.json);
        calls.set(call.id, {
          name: call.name,
          json: call.json,
          extractions: call.extractions || [],
          parsedJson: parsedResult.success ? parsedResult.data : null,
          parseError: parsedResult.success ? null : parsedResult.error,
        });
        callCounter++;
      }

      activeCallId = data.activeCallId;
      if (activeCallId && !calls.has(activeCallId)) {
        activeCallId = calls.size > 0 ? calls.keys().next().value : null;
      }

      persist();
      notifyListeners('imported');
    },
  };
}

// Export singleton
export const callsStore = createCallsStore();
