/**
 * Tests for the PWA remote-ui hierarchy rendering logic.
 * Since app.js is a browser script (not a module), we re-implement
 * the pure functions here and test them in isolation.
 * This ensures the logic stays correct as we refactor.
 */

// ── Pure functions extracted from remote-ui/app.js ──

function countProjectsInFolder(folderId, folders, projects) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return 0;
  let count = 0;
  for (const childId of (folder.children || [])) {
    const isFolder = folders.some(f => f.id === childId);
    if (isFolder) {
      count += countProjectsInFolder(childId, folders, projects);
    } else {
      count++;
    }
  }
  return count;
}

function buildHierarchyOrder(rootOrder, folders, collapsedFolders) {
  // Returns a flat list of { type, id, depth } representing the visual order
  const result = [];
  function walk(itemId, depth) {
    const folder = folders.find(f => f.id === itemId);
    if (folder) {
      result.push({ type: 'folder', id: folder.id, depth });
      if (!collapsedFolders[folder.id]) {
        for (const childId of (folder.children || [])) {
          walk(childId, depth + 1);
        }
      }
    } else {
      result.push({ type: 'project', id: itemId, depth });
    }
  }
  for (const id of rootOrder) {
    walk(id, 0);
  }
  return result;
}

// ── Tests ──

describe('countProjectsInFolder', () => {
  const projects = [
    { id: 'p1', name: 'A', folderId: 'f1' },
    { id: 'p2', name: 'B', folderId: 'f2' },
    { id: 'p3', name: 'C', folderId: null },
    { id: 'p4', name: 'D', folderId: 'f1' },
  ];

  test('counts direct children (non-folder items in children array)', () => {
    const folders = [
      { id: 'f1', name: 'Root', children: ['p1', 'p4'] },
    ];
    expect(countProjectsInFolder('f1', folders, projects)).toBe(2);
  });

  test('counts nested projects recursively', () => {
    const folders = [
      { id: 'f1', name: 'Root', children: ['f2', 'p1'] },
      { id: 'f2', name: 'Sub', children: ['p2'] },
    ];
    expect(countProjectsInFolder('f1', folders, projects)).toBe(2);
  });

  test('returns 0 for empty folder', () => {
    const folders = [
      { id: 'f1', name: 'Empty', children: [] },
    ];
    expect(countProjectsInFolder('f1', folders, projects)).toBe(0);
  });

  test('returns 0 for non-existent folder', () => {
    expect(countProjectsInFolder('nonexistent', [], projects)).toBe(0);
  });

  test('handles deeply nested folders', () => {
    const folders = [
      { id: 'f1', name: 'L1', children: ['f2'] },
      { id: 'f2', name: 'L2', children: ['f3'] },
      { id: 'f3', name: 'L3', children: ['p1'] },
    ];
    expect(countProjectsInFolder('f1', folders, projects)).toBe(1);
  });

  test('handles folder with only subfolders and no projects', () => {
    const folders = [
      { id: 'f1', name: 'Parent', children: ['f2', 'f3'] },
      { id: 'f2', name: 'Empty1', children: [] },
      { id: 'f3', name: 'Empty2', children: [] },
    ];
    expect(countProjectsInFolder('f1', folders, projects)).toBe(0);
  });

  test('counts multiple projects across nested folders', () => {
    const folders = [
      { id: 'f1', name: 'Root', children: ['p1', 'f2', 'p4'] },
      { id: 'f2', name: 'Sub', children: ['p2', 'f3'] },
      { id: 'f3', name: 'Deep', children: ['p3'] },
    ];
    // p1 + p4 (in f1) + p2 (in f2) + p3 (in f3) = 4
    expect(countProjectsInFolder('f1', folders, [
      { id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' },
    ])).toBe(4);
  });
});

describe('buildHierarchyOrder', () => {
  const folders = [
    { id: 'f1', name: 'Games', children: ['p1', 'p2'] },
    { id: 'f2', name: 'Work', children: ['f3', 'p4'] },
    { id: 'f3', name: 'Frontend', children: ['p5'] },
  ];

  test('returns flat list respecting hierarchy and depth', () => {
    const order = buildHierarchyOrder(['f1', 'p3', 'f2'], folders, {});
    expect(order).toEqual([
      { type: 'folder', id: 'f1', depth: 0 },
      { type: 'project', id: 'p1', depth: 1 },
      { type: 'project', id: 'p2', depth: 1 },
      { type: 'project', id: 'p3', depth: 0 },
      { type: 'folder', id: 'f2', depth: 0 },
      { type: 'folder', id: 'f3', depth: 1 },
      { type: 'project', id: 'p5', depth: 2 },
      { type: 'project', id: 'p4', depth: 1 },
    ]);
  });

  test('collapsed folder hides children', () => {
    const order = buildHierarchyOrder(['f1', 'p3'], folders, { f1: true });
    expect(order).toEqual([
      { type: 'folder', id: 'f1', depth: 0 },
      { type: 'project', id: 'p3', depth: 0 },
    ]);
  });

  test('collapsing parent hides nested children too', () => {
    const order = buildHierarchyOrder(['f2'], folders, { f2: true });
    expect(order).toEqual([
      { type: 'folder', id: 'f2', depth: 0 },
    ]);
    // f3 and p4 and p5 are all hidden
  });

  test('collapsing only nested folder shows parent children but not nested', () => {
    const order = buildHierarchyOrder(['f2'], folders, { f3: true });
    expect(order).toEqual([
      { type: 'folder', id: 'f2', depth: 0 },
      { type: 'folder', id: 'f3', depth: 1 },
      // p5 is hidden because f3 is collapsed
      { type: 'project', id: 'p4', depth: 1 },
    ]);
  });

  test('empty rootOrder returns empty list', () => {
    const order = buildHierarchyOrder([], folders, {});
    expect(order).toEqual([]);
  });

  test('rootOrder with only projects (no folders)', () => {
    const order = buildHierarchyOrder(['p1', 'p2', 'p3'], [], {});
    expect(order).toEqual([
      { type: 'project', id: 'p1', depth: 0 },
      { type: 'project', id: 'p2', depth: 0 },
      { type: 'project', id: 'p3', depth: 0 },
    ]);
  });

  test('handles item in rootOrder that is not a folder nor known', () => {
    const order = buildHierarchyOrder(['unknown-id'], [], {});
    expect(order).toEqual([
      { type: 'project', id: 'unknown-id', depth: 0 },
    ]);
  });
});

describe('hierarchy edge cases', () => {
  test('folder with missing children reference does not crash', () => {
    const folders = [
      { id: 'f1', name: 'Test', children: ['p999'] },
    ];
    // p999 doesn't exist in projects, but it's not a folder either
    // so it should be treated as a project
    const order = buildHierarchyOrder(['f1'], folders, {});
    expect(order).toEqual([
      { type: 'folder', id: 'f1', depth: 0 },
      { type: 'project', id: 'p999', depth: 1 },
    ]);
  });

  test('folder with undefined children does not crash', () => {
    const folders = [
      { id: 'f1', name: 'Test' },
    ];
    const order = buildHierarchyOrder(['f1'], folders, {});
    expect(order).toEqual([
      { type: 'folder', id: 'f1', depth: 0 },
    ]);
  });

  test('deeply nested hierarchy (5 levels) renders correctly', () => {
    const folders = [
      { id: 'f1', children: ['f2'] },
      { id: 'f2', children: ['f3'] },
      { id: 'f3', children: ['f4'] },
      { id: 'f4', children: ['f5'] },
      { id: 'f5', children: ['p1'] },
    ];
    const order = buildHierarchyOrder(['f1'], folders, {});
    expect(order).toHaveLength(6); // 5 folders + 1 project
    expect(order[0]).toEqual({ type: 'folder', id: 'f1', depth: 0 });
    expect(order[4]).toEqual({ type: 'folder', id: 'f5', depth: 4 });
    expect(order[5]).toEqual({ type: 'project', id: 'p1', depth: 5 });
  });
});
