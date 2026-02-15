const originalPlatform = process.platform;
const originalShell = process.env.SHELL;

// Helper to mock process.platform
function setPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true });
}

// Re-require module to pick up platform change
function loadShell() {
  delete require.cache[require.resolve('../../src/main/utils/shell')];
  return require('../../src/main/utils/shell');
}

afterEach(() => {
  setPlatform(originalPlatform);
  if (originalShell !== undefined) {
    process.env.SHELL = originalShell;
  } else {
    delete process.env.SHELL;
  }
});

describe('getShell', () => {
  test('returns cmd.exe on Windows', () => {
    setPlatform('win32');
    const { getShell } = loadShell();
    expect(getShell()).toEqual({ path: 'cmd.exe', args: [] });
  });

  test('returns $SHELL on macOS', () => {
    setPlatform('darwin');
    process.env.SHELL = '/bin/zsh';
    const { getShell } = loadShell();
    expect(getShell()).toEqual({ path: '/bin/zsh', args: [] });
  });

  test('returns $SHELL on Linux', () => {
    setPlatform('linux');
    process.env.SHELL = '/usr/bin/fish';
    const { getShell } = loadShell();
    expect(getShell()).toEqual({ path: '/usr/bin/fish', args: [] });
  });

  test('falls back to /bin/bash when $SHELL is not set', () => {
    setPlatform('linux');
    delete process.env.SHELL;
    const { getShell } = loadShell();
    expect(getShell()).toEqual({ path: '/bin/bash', args: [] });
  });
});

describe('getShellPromptPattern', () => {
  test('returns ">" string on Windows', () => {
    setPlatform('win32');
    const { getShellPromptPattern } = loadShell();
    expect(getShellPromptPattern()).toBe('>');
  });

  test('returns RegExp on macOS', () => {
    setPlatform('darwin');
    const { getShellPromptPattern } = loadShell();
    expect(getShellPromptPattern()).toBeInstanceOf(RegExp);
  });

  test('returns RegExp on Linux', () => {
    setPlatform('linux');
    const { getShellPromptPattern } = loadShell();
    expect(getShellPromptPattern()).toBeInstanceOf(RegExp);
  });
});

describe('matchesShellPrompt', () => {
  test('matches CMD prompt on Windows', () => {
    setPlatform('win32');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('C:\\Users\\Test>')).toBe(true);
    expect(matchesShellPrompt('D:\\project>')).toBe(true);
  });

  test('does not match empty string on Windows', () => {
    setPlatform('win32');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('')).toBe(false);
  });

  test('matches $ prompt on Unix', () => {
    setPlatform('linux');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('user@host:~$ ')).toBe(true);
  });

  test('matches # prompt on Unix (root)', () => {
    setPlatform('linux');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('root@host:~# ')).toBe(true);
  });

  test('matches % prompt on Unix (zsh)', () => {
    setPlatform('darwin');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('user@mac ~ % ')).toBe(true);
  });

  test('does not match random text on Unix', () => {
    setPlatform('linux');
    const { matchesShellPrompt } = loadShell();
    expect(matchesShellPrompt('Loading...')).toBe(false);
  });
});
