const { getEditorCommand, EDITOR_OPTIONS, getSettings, getSetting } = require('../../src/renderer/state/settings.state');

describe('getEditorCommand', () => {
  test('"code" returns "code"', () => {
    expect(getEditorCommand('code')).toBe('code');
  });

  test('"cursor" returns "cursor"', () => {
    expect(getEditorCommand('cursor')).toBe('cursor');
  });

  test('"webstorm" returns "webstorm"', () => {
    expect(getEditorCommand('webstorm')).toBe('webstorm');
  });

  test('"idea" returns "idea"', () => {
    expect(getEditorCommand('idea')).toBe('idea');
  });

  test('unknown editor falls back to "code"', () => {
    expect(getEditorCommand('unknown')).toBe('code');
  });

  test('null falls back to "code"', () => {
    expect(getEditorCommand(null)).toBe('code');
  });
});

describe('EDITOR_OPTIONS', () => {
  test('has 4 items', () => {
    expect(EDITOR_OPTIONS).toHaveLength(4);
  });

  test('each item has value and label', () => {
    EDITOR_OPTIONS.forEach(opt => {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
    });
  });
});

describe('getSettings', () => {
  test('returns an object with default keys', () => {
    const settings = getSettings();
    expect(settings).toHaveProperty('editor');
    expect(settings).toHaveProperty('accentColor');
    expect(settings).toHaveProperty('language');
    expect(settings).toHaveProperty('notificationsEnabled');
    expect(settings).toHaveProperty('closeAction');
    expect(settings).toHaveProperty('compactProjects');
    expect(settings).toHaveProperty('customPresets');
  });
});

describe('getSetting', () => {
  test('editor defaults to "code"', () => {
    expect(getSetting('editor')).toBe('code');
  });

  test('accentColor defaults to "#d97706"', () => {
    expect(getSetting('accentColor')).toBe('#d97706');
  });

  test('notificationsEnabled defaults to true', () => {
    expect(getSetting('notificationsEnabled')).toBe(true);
  });

  test('unknown key returns undefined', () => {
    expect(getSetting('nonexistent')).toBeUndefined();
  });
});
