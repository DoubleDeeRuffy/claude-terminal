const { generateCommitMessage, generateSessionRecapHeuristic } = require('../../src/main/utils/commitMessageGenerator');

// ── generateCommitMessage (heuristic path — no token) ──

describe('generateCommitMessage heuristic', () => {
  test('returns empty for no files', async () => {
    const result = await generateCommitMessage([], '', null);
    expect(result.message).toBe('');
    expect(result.source).toBe('heuristic');
  });

  test('returns empty for null files', async () => {
    const result = await generateCommitMessage(null, '', null);
    expect(result.message).toBe('');
    expect(result.source).toBe('heuristic');
  });

  // ── detectType via heuristic ──

  test('detects test type from .test.js path', async () => {
    const files = [{ path: 'src/utils/format.test.js', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^test/);
  });

  test('detects style type from .css path', async () => {
    const files = [{ path: 'styles/chat.css', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^style/);
  });

  test('detects docs type from .md path', async () => {
    const files = [{ path: 'README.md', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^docs/);
  });

  test('detects chore type from package.json', async () => {
    const files = [{ path: 'package.json', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^chore/);
  });

  test('detects ci type from .github/ path', async () => {
    const files = [{ path: '.github/workflows/ci.yml', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^ci/);
  });

  test('detects fix type from diff content keywords', async () => {
    const files = [{ path: 'src/app.js', status: 'M' }];
    const result = await generateCommitMessage(files, 'fix bug in parser', null);
    expect(result.message).toMatch(/^fix/);
  });

  test('detects perf type from diff content keywords', async () => {
    const files = [{ path: 'src/app.js', status: 'M' }];
    const result = await generateCommitMessage(files, 'add debounce to input handler', null);
    expect(result.message).toMatch(/^perf/);
  });

  test('defaults to feat for all-added files', async () => {
    const files = [
      { path: 'src/newFeature.js', status: 'A' },
      { path: 'src/newHelper.js', status: 'A' },
    ];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^feat/);
  });

  test('defaults to chore for all-deleted files', async () => {
    const files = [
      { path: 'src/oldFile.js', status: 'D' },
      { path: 'src/legacy.js', status: 'D' },
    ];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toMatch(/^chore/);
  });

  // ── detectScope via heuristic ──

  test('detects ui scope from renderer path', async () => {
    const files = [{ path: 'src/renderer/utils/format.js', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('(ui)');
  });

  test('detects main scope from main/ipc path', async () => {
    const files = [{ path: 'src/main/ipc/chat.ipc.js', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    // 'main' comes before 'ipc' in the path, so SCOPE_MAP maps to 'main'
    expect(result.message).toContain('(main)');
  });

  test('no scope for files from multiple different dirs', async () => {
    const files = [
      { path: 'src/renderer/app.js', status: 'M' },
      { path: 'src/main/ipc/chat.js', status: 'M' },
    ];
    const result = await generateCommitMessage(files, '', null);
    // Should not contain scope parentheses since dirs differ
    expect(result.message).not.toMatch(/\(.+\)/);
  });

  // ── generateDescription via heuristic ──

  test('single added file says "add <name>"', async () => {
    const files = [{ path: 'src/utils/parser.js', status: 'A' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('add parser');
  });

  test('single deleted file says "remove <name>"', async () => {
    const files = [{ path: 'src/old.js', status: 'D' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('remove old');
  });

  test('single modified file says "update <name>"', async () => {
    const files = [{ path: 'src/app.js', status: 'M' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('update app');
  });

  test('single renamed file says "rename <name>"', async () => {
    const files = [{ path: 'src/old.js', status: 'R' }];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('rename old');
  });

  test('multiple files gives file count description', async () => {
    const files = [
      { path: 'src/a.js', status: 'A' },
      { path: 'src/b.js', status: 'M' },
      { path: 'src/c.js', status: 'D' },
    ];
    const result = await generateCommitMessage(files, '', null);
    expect(result.message).toContain('add 1 file');
    expect(result.message).toContain('remove 1 file');
    expect(result.message).toContain('update 1 file');
  });

  // ── groupFiles via heuristic ──

  test('returns groups array', async () => {
    const files = [
      { path: 'renderer/a.js', status: 'M' },
      { path: 'main/b.js', status: 'M' },
    ];
    const result = await generateCommitMessage(files, '', null);
    expect(result.groups).toBeInstanceOf(Array);
    expect(result.groups.length).toBeGreaterThanOrEqual(1);
  });

  test('source is always heuristic without token', async () => {
    const files = [{ path: 'src/app.js', status: 'M' }];
    const result = await generateCommitMessage(files, 'some diff', null);
    expect(result.source).toBe('heuristic');
  });
});

// ── generateSessionRecapHeuristic ──

describe('generateSessionRecapHeuristic', () => {
  test('formats tool counts sorted by frequency', () => {
    const ctx = { toolCounts: { Write: 4, Edit: 3, Bash: 1 }, toolCount: 8, prompts: [] };
    const result = generateSessionRecapHeuristic(ctx);
    expect(result).toBe('Write ×4, Edit ×3, Bash ×1');
  });

  test('limits to 4 tools', () => {
    const ctx = { toolCounts: { Write: 5, Edit: 4, Bash: 3, Read: 2, Glob: 1 }, toolCount: 15 };
    const result = generateSessionRecapHeuristic(ctx);
    expect(result).not.toContain('Glob');
    expect(result.split(',').length).toBe(4);
  });

  test('falls back to tool count when no toolCounts', () => {
    const ctx = { toolCounts: {}, toolCount: 5, prompts: [] };
    const result = generateSessionRecapHeuristic(ctx);
    expect(result).toBe('5 tool uses');
  });

  test('handles empty context gracefully', () => {
    const result = generateSessionRecapHeuristic({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
