const {
  registerShortcut,
  registerCommonShortcuts,
  clearAllShortcuts,
  getRegisteredShortcuts,
  getKeyFromEvent,
  normalizeKey
} = require('../../src/renderer/features/KeyboardShortcuts');

beforeEach(() => {
  clearAllShortcuts();
});

// --- normalizeKey ---

describe('normalizeKey', () => {
  test('lowercases and sorts modifiers', () => {
    expect(normalizeKey('Shift+Ctrl+T')).toBe('ctrl+shift+t');
  });

  test('handles Meta modifier', () => {
    expect(normalizeKey('Meta+T')).toBe('meta+t');
  });

  test('sorts meta after shift', () => {
    expect(normalizeKey('Meta+Shift+Tab')).toBe('shift+meta+tab');
  });

  test('handles single key', () => {
    expect(normalizeKey('Escape')).toBe('escape');
  });

  test('strips whitespace', () => {
    expect(normalizeKey('Ctrl + P')).toBe('ctrl+p');
  });

  test('sorts ctrl before alt before shift before meta', () => {
    expect(normalizeKey('Meta+Alt+Shift+Ctrl+X')).toBe('ctrl+alt+shift+meta+x');
  });
});

// --- getKeyFromEvent ---

describe('getKeyFromEvent', () => {
  function mockEvent(overrides) {
    return {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: 'a',
      ...overrides
    };
  }

  test('Ctrl+T on Windows/Linux', () => {
    expect(getKeyFromEvent(mockEvent({ ctrlKey: true, key: 't' }))).toBe('ctrl+t');
  });

  test('Meta+T on macOS', () => {
    expect(getKeyFromEvent(mockEvent({ metaKey: true, key: 't' }))).toBe('meta+t');
  });

  test('Meta+Shift+Tab', () => {
    expect(getKeyFromEvent(mockEvent({ metaKey: true, shiftKey: true, key: 'Tab' }))).toBe('shift+meta+tab');
  });

  test('Escape alone', () => {
    expect(getKeyFromEvent(mockEvent({ key: 'Escape' }))).toBe('escape');
  });

  test('maps ArrowUp to up', () => {
    expect(getKeyFromEvent(mockEvent({ key: 'ArrowUp' }))).toBe('up');
  });

  test('maps ArrowDown to down', () => {
    expect(getKeyFromEvent(mockEvent({ key: 'ArrowDown' }))).toBe('down');
  });

  test('maps space key', () => {
    expect(getKeyFromEvent(mockEvent({ key: ' ' }))).toBe('space');
  });

  test('ignores standalone modifier keys', () => {
    expect(getKeyFromEvent(mockEvent({ ctrlKey: true, key: 'Control' }))).toBe('ctrl');
    expect(getKeyFromEvent(mockEvent({ metaKey: true, key: 'Meta' }))).toBe('meta');
  });
});

// --- registerShortcut + getRegisteredShortcuts ---

describe('registerShortcut', () => {
  test('registers and retrieves a Ctrl shortcut', () => {
    const handler = jest.fn();
    registerShortcut('Ctrl+N', handler);
    const registered = getRegisteredShortcuts();
    expect(registered.has('ctrl+n')).toBe(true);
    expect(registered.get('ctrl+n').handler).toBe(handler);
  });

  test('registers and retrieves a Meta shortcut', () => {
    const handler = jest.fn();
    registerShortcut('Meta+N', handler);
    const registered = getRegisteredShortcuts();
    expect(registered.has('meta+n')).toBe(true);
  });

  test('Meta+T and Ctrl+T are different shortcuts', () => {
    const metaHandler = jest.fn();
    const ctrlHandler = jest.fn();
    registerShortcut('Meta+T', metaHandler);
    registerShortcut('Ctrl+T', ctrlHandler);
    const registered = getRegisteredShortcuts();
    expect(registered.size).toBe(2);
    expect(registered.get('meta+t').handler).toBe(metaHandler);
    expect(registered.get('ctrl+t').handler).toBe(ctrlHandler);
  });
});

// --- registerCommonShortcuts ---

describe('registerCommonShortcuts', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true });
    clearAllShortcuts();
  });

  test('registers Ctrl shortcuts on non-Mac', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Win32', userAgent: 'Windows' },
      writable: true
    });

    const handlers = {
      newTerminal: jest.fn(),
      closeTerminal: jest.fn(),
      quickPicker: jest.fn(),
      settings: jest.fn(),
      escape: jest.fn(),
      nextTerminal: jest.fn(),
      prevTerminal: jest.fn()
    };

    registerCommonShortcuts(handlers);
    const registered = getRegisteredShortcuts();

    expect(registered.has('ctrl+t')).toBe(true);
    expect(registered.has('ctrl+w')).toBe(true);
    expect(registered.has('ctrl+p')).toBe(true);
    expect(registered.has('ctrl+,')).toBe(true);
    expect(registered.has('escape')).toBe(true);
    expect(registered.has('ctrl+tab')).toBe(true);
    expect(registered.has('ctrl+shift+tab')).toBe(true);

    // Meta variants should NOT be registered
    expect(registered.has('meta+t')).toBe(false);
    expect(registered.has('meta+w')).toBe(false);
  });

  test('registers Meta shortcuts on Mac', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'MacIntel', userAgent: 'Macintosh' },
      writable: true
    });

    const handlers = {
      newTerminal: jest.fn(),
      closeTerminal: jest.fn(),
      quickPicker: jest.fn(),
      settings: jest.fn(),
      escape: jest.fn(),
      nextTerminal: jest.fn(),
      prevTerminal: jest.fn()
    };

    registerCommonShortcuts(handlers);
    const registered = getRegisteredShortcuts();

    expect(registered.has('meta+t')).toBe(true);
    expect(registered.has('meta+w')).toBe(true);
    expect(registered.has('meta+p')).toBe(true);
    expect(registered.has('meta+,')).toBe(true);
    expect(registered.has('escape')).toBe(true);
    expect(registered.has('meta+tab')).toBe(true);
    expect(registered.has('shift+meta+tab')).toBe(true);

    // Ctrl variants should NOT be registered
    expect(registered.has('ctrl+t')).toBe(false);
    expect(registered.has('ctrl+w')).toBe(false);
  });

  test('only registers provided handlers', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Win32', userAgent: 'Windows' },
      writable: true
    });

    registerCommonShortcuts({ newTerminal: jest.fn() });
    const registered = getRegisteredShortcuts();

    expect(registered.size).toBe(1);
    expect(registered.has('ctrl+t')).toBe(true);
  });
});
