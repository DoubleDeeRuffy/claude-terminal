const { State } = require('../../src/renderer/state/State');

describe('State', () => {
  let state;

  beforeEach(() => {
    state = new State({ count: 0, name: 'test' });
  });

  test('constructor sets initial state', () => {
    expect(state.get()).toEqual({ count: 0, name: 'test' });
  });

  test('constructor defaults to empty object', () => {
    const empty = new State();
    expect(empty.get()).toEqual({});
  });

  test('get() returns current state', () => {
    expect(state.get()).toEqual({ count: 0, name: 'test' });
  });

  test('getProp() returns a specific property', () => {
    expect(state.getProp('count')).toBe(0);
    expect(state.getProp('name')).toBe('test');
  });

  test('getProp() returns undefined for missing key', () => {
    expect(state.getProp('missing')).toBeUndefined();
  });

  test('set(object) merges state', () => {
    state.set({ count: 5 });
    expect(state.get()).toEqual({ count: 5, name: 'test' });
  });

  test('set(function) uses updater function', () => {
    state.set(prev => ({ ...prev, count: prev.count + 1 }));
    expect(state.get()).toEqual({ count: 1, name: 'test' });
  });

  test('setProp() updates a specific property', () => {
    state.setProp('count', 42);
    expect(state.getProp('count')).toBe(42);
  });

  test('subscribe() listener is called after set', async () => {
    const listener = jest.fn();
    state.subscribe(listener);
    state.set({ count: 1 });

    // Wait for requestAnimationFrame (mocked as setTimeout)
    await new Promise(r => setTimeout(r, 0));
    expect(listener).toHaveBeenCalledWith({ count: 1, name: 'test' });
  });

  test('subscribe() returns working unsubscribe function', async () => {
    const listener = jest.fn();
    const unsub = state.subscribe(listener);
    unsub();
    state.set({ count: 1 });

    await new Promise(r => setTimeout(r, 0));
    expect(listener).not.toHaveBeenCalled();
  });

  test('multiple set() calls are batched', async () => {
    const listener = jest.fn();
    state.subscribe(listener);
    state.set({ count: 1 });
    state.set({ count: 2 });
    state.set({ count: 3 });

    await new Promise(r => setTimeout(r, 0));
    // Batched: listener called once with final state
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ count: 3, name: 'test' });
  });

  test('reset() resets state', () => {
    state.set({ count: 99 });
    state.reset({ count: 0 });
    expect(state.get()).toEqual({ count: 0 });
  });

  test('reset() without args sets empty state', () => {
    state.reset();
    expect(state.get()).toEqual({});
  });

  test('_notifySync() calls listeners synchronously', () => {
    const listener = jest.fn();
    state.subscribe(listener);
    state._notifySync();
    // Called immediately, no need to await
    expect(listener).toHaveBeenCalledWith({ count: 0, name: 'test' });
  });
});
