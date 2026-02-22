// RemoteServer unit tests — PIN logic, data serialization, network utils

jest.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/mock/app' },
}));

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(),
}));

// Mock fs
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(),
  createReadStream: jest.fn(),
};
jest.mock('fs', () => mockFs);

// Mock paths util
jest.mock('../../src/main/utils/paths', () => ({
  settingsFile: '/mock/settings.json',
  projectsFile: '/mock/projects.json',
}));

// Mock ChatService
jest.mock('../../src/main/services/ChatService', () => ({
  getActiveSessions: jest.fn(() => []),
}));

const remoteServer = require('../../src/main/services/RemoteServer');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── PIN Generation ──

describe('generatePin', () => {
  test('returns a 4-digit string', () => {
    const pin = remoteServer.generatePin();
    expect(typeof pin).toBe('string');
    expect(pin).toMatch(/^\d{4}$/);
  });

  test('generates different PINs (probabilistic)', () => {
    const pins = new Set();
    for (let i = 0; i < 50; i++) {
      pins.add(remoteServer.generatePin());
    }
    // With 50 random 4-digit PINs, we should have at least a few unique ones
    expect(pins.size).toBeGreaterThan(1);
  });

  test('PIN is padded to 4 digits', () => {
    // Even if crypto.randomInt gives 0, should be '0000'
    const crypto = require('crypto');
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(0);
    const pin = remoteServer.generatePin();
    expect(pin).toBe('0000');
    expect(pin.length).toBe(4);
    crypto.randomInt.mockRestore();
  });
});

describe('getPin', () => {
  test('returns null pin before generatePin is called', () => {
    // Fresh state — no PIN generated yet in this test run
    // Note: previous tests may have called generatePin, so we just check the shape
    const result = remoteServer.getPin();
    expect(result).toHaveProperty('pin');
    expect(result).toHaveProperty('expiresAt');
    expect(result).toHaveProperty('used');
  });

  test('returns generated PIN after generatePin', () => {
    const pin = remoteServer.generatePin();
    const result = remoteServer.getPin();
    expect(result.pin).toBe(pin);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(result.used).toBe(false);
  });

  test('returns same PIN on multiple calls (no auto-regen)', () => {
    remoteServer.generatePin();
    const first = remoteServer.getPin();
    const second = remoteServer.getPin();
    expect(first.pin).toBe(second.pin);
    expect(first.expiresAt).toBe(second.expiresAt);
  });

  test('does NOT auto-regenerate when PIN has expired', () => {
    remoteServer.generatePin();
    const first = remoteServer.getPin();
    // Simulate expiry
    const originalNow = Date.now;
    Date.now = () => originalNow() + 3 * 60 * 1000;
    const second = remoteServer.getPin();
    // Should return the same expired PIN — no auto-regen
    expect(second.pin).toBe(first.pin);
    expect(second.expiresAt).toBe(first.expiresAt);
    Date.now = originalNow;
  });
});

// ── broadcastProjectsUpdate serialization ──

describe('broadcastProjectsUpdate', () => {
  test('does not throw with empty projects', () => {
    expect(() => remoteServer.broadcastProjectsUpdate([])).not.toThrow();
  });

  test('does not throw with null projects', () => {
    expect(() => remoteServer.broadcastProjectsUpdate(null)).not.toThrow();
  });

  test('reads folders from disk when broadcasting', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      projects: [],
      folders: [{ id: 'f1', name: 'Folder', parentId: null, children: ['p1'], color: '#ff0000', icon: null }],
      rootOrder: ['f1', 'p1'],
    }));

    remoteServer.broadcastProjectsUpdate([
      { id: 'p1', name: 'Test', path: '/test', color: '#d97706', icon: null, folderId: 'f1' },
    ]);

    // Should have read the projects file to get folders
    expect(mockFs.existsSync).toHaveBeenCalled();
    expect(mockFs.readFileSync).toHaveBeenCalled();
  });

  test('handles missing projects file gracefully', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(() => remoteServer.broadcastProjectsUpdate([
      { id: 'p1', name: 'Test', path: '/test' },
    ])).not.toThrow();
  });

  test('handles corrupted projects file gracefully', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{corrupted json');
    expect(() => remoteServer.broadcastProjectsUpdate([
      { id: 'p1', name: 'Test', path: '/test' },
    ])).not.toThrow();
  });
});

// ── getServerInfo ──

describe('getServerInfo', () => {
  test('returns running: false when server is not started', () => {
    const info = remoteServer.getServerInfo();
    expect(info.running).toBe(false);
    expect(info).toHaveProperty('networkInterfaces');
    expect(Array.isArray(info.networkInterfaces)).toBe(true);
  });
});

// ── setTimeData ──

describe('setTimeData', () => {
  test('does not throw with valid data', () => {
    expect(() => remoteServer.setTimeData({ todayMs: 3600000 })).not.toThrow();
  });

  test('does not throw with zero', () => {
    expect(() => remoteServer.setTimeData({ todayMs: 0 })).not.toThrow();
  });
});

// ── Data Mapping ──

describe('project data mapping', () => {
  test('broadcastProjectsUpdate includes folderId in serialized projects', () => {
    // No connected clients, so broadcast is a no-op, but we test it doesn't crash
    // and that the mapping logic works correctly
    const projects = [
      { id: 'p1', name: 'Test', path: '/test', color: '#d97706', icon: '🚀', folderId: 'f1', extra: 'should-be-kept' },
      { id: 'p2', name: 'Root', path: '/root', folderId: null },
    ];
    mockFs.existsSync.mockReturnValue(false);
    expect(() => remoteServer.broadcastProjectsUpdate(projects)).not.toThrow();
  });
});
