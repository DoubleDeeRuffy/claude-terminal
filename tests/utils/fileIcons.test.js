const { getFileIcon } = require('../../src/renderer/utils/fileIcons');

describe('getFileIcon', () => {
  describe('directories', () => {
    test('closed directory contains "fe-icon-folder"', () => {
      const icon = getFileIcon('src', true, false);
      expect(icon).toContain('fe-icon-folder');
      expect(icon).not.toContain('fe-icon-folder-open');
    });

    test('open directory contains "fe-icon-folder-open"', () => {
      const icon = getFileIcon('src', true, true);
      expect(icon).toContain('fe-icon-folder-open');
    });
  });

  describe('extensions', () => {
    test('app.js returns icon containing "JS"', () => {
      expect(getFileIcon('app.js')).toContain('JS');
    });

    test('style.css returns icon containing "CSS"', () => {
      expect(getFileIcon('style.css')).toContain('CSS');
    });

    test('app.ts returns icon containing "TS"', () => {
      expect(getFileIcon('app.ts')).toContain('TS');
    });

    test('script.py returns icon containing "PY"', () => {
      expect(getFileIcon('script.py')).toContain('PY');
    });
  });

  describe('special filenames', () => {
    test('package.json returns icon containing "NPM"', () => {
      expect(getFileIcon('package.json')).toContain('NPM');
    });

    test('.gitignore returns icon containing "GIT"', () => {
      expect(getFileIcon('.gitignore')).toContain('GIT');
    });

    test('Dockerfile returns icon containing "DOCK"', () => {
      expect(getFileIcon('Dockerfile')).toContain('DOCK');
    });
  });

  describe('fallback', () => {
    test('unknown.xyz returns default file icon with "fe-icon"', () => {
      const icon = getFileIcon('unknown.xyz');
      expect(icon).toContain('fe-icon');
    });

    test('file with no extension returns default file icon', () => {
      const icon = getFileIcon('Makefile');
      expect(icon).toContain('fe-icon');
    });
  });
});
