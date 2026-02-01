/**
 * State - Simple Observable State Class
 * Provides a reactive state container with subscription support
 */

class State {
  constructor(initialState = {}) {
    this._state = initialState;
    this._listeners = new Set();
    this._notifyScheduled = false;
  }

  /**
   * Get the current state
   * @returns {Object}
   */
  get() {
    return this._state;
  }

  /**
   * Get a specific property from state
   * @param {string} key - Property key
   * @returns {*}
   */
  getProp(key) {
    return this._state[key];
  }

  /**
   * Update the state
   * @param {Object|Function} updates - New state object or updater function
   */
  set(updates) {
    const newState = typeof updates === 'function'
      ? updates(this._state)
      : { ...this._state, ...updates };

    this._state = newState;
    this._notify();
  }

  /**
   * Update a specific property
   * @param {string} key - Property key
   * @param {*} value - New value
   */
  setProp(key, value) {
    this._state[key] = value;
    this._notify();
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Schedule notification for next animation frame (batches multiple updates)
   * @private
   */
  _notify() {
    if (this._notifyScheduled) return;
    this._notifyScheduled = true;
    requestAnimationFrame(() => {
      this._notifyScheduled = false;
      this._listeners.forEach(listener => {
        try {
          listener(this._state);
        } catch (e) {
          console.error('State listener error:', e);
        }
      });
    });
  }

  /**
   * Notify all listeners synchronously (use sparingly, e.g. before app quit)
   */
  _notifySync() {
    this._listeners.forEach(listener => {
      try {
        listener(this._state);
      } catch (e) {
        console.error('State listener error:', e);
      }
    });
  }

  /**
   * Reset state to initial value
   * @param {Object} initialState - Initial state
   */
  reset(initialState = {}) {
    this._state = initialState;
    this._notify();
  }
}

module.exports = { State };
