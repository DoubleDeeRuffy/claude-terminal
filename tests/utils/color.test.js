const { hexToRgb, rgbToHex, lightenColor, darkenColor, ACCENT_COLORS } = require('../../src/renderer/utils/color');

describe('hexToRgb', () => {
  test('#ff0000 returns {r:255, g:0, b:0}', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('ff0000 without # returns {r:255, g:0, b:0}', () => {
    expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('#000000 returns {r:0, g:0, b:0}', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('#ffffff returns {r:255, g:255, b:255}', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  test('"invalid" returns null', () => {
    expect(hexToRgb('invalid')).toBeNull();
  });

  test('empty string returns null', () => {
    expect(hexToRgb('')).toBeNull();
  });
});

describe('rgbToHex', () => {
  test('(255, 0, 0) returns "#ff0000"', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
  });

  test('(0, 0, 0) returns "#000000"', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  test('(255, 255, 255) returns "#ffffff"', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  test('clamping: (300, -5, 0) returns "#ff0000"', () => {
    expect(rgbToHex(300, -5, 0)).toBe('#ff0000');
  });
});

describe('lightenColor', () => {
  test('#000000 lightened 50% gives medium grey', () => {
    const result = lightenColor('#000000', 50);
    // 0 + (255 - 0) * 50/100 = 127 → floor = 127
    expect(result).toBe('#7f7f7f');
  });

  test('#ff0000 lightened 0% stays #ff0000', () => {
    expect(lightenColor('#ff0000', 0)).toBe('#ff0000');
  });

  test('invalid hex returns the input unchanged', () => {
    expect(lightenColor('invalid', 50)).toBe('invalid');
  });

  test('#000000 lightened 100% gives #ffffff', () => {
    expect(lightenColor('#000000', 100)).toBe('#ffffff');
  });
});

describe('darkenColor', () => {
  test('#ffffff darkened 50% gives medium grey', () => {
    const result = darkenColor('#ffffff', 50);
    // 255 * (100 - 50) / 100 = 127 → floor = 127
    expect(result).toBe('#7f7f7f');
  });

  test('#ff0000 darkened 0% stays #ff0000', () => {
    expect(darkenColor('#ff0000', 0)).toBe('#ff0000');
  });

  test('#ffffff darkened 100% gives #000000', () => {
    expect(darkenColor('#ffffff', 100)).toBe('#000000');
  });

  test('invalid hex returns the input unchanged', () => {
    expect(darkenColor('invalid', 50)).toBe('invalid');
  });
});

describe('ACCENT_COLORS', () => {
  test('is an array of 10 items', () => {
    expect(ACCENT_COLORS).toHaveLength(10);
  });

  test('each item has name and hex properties', () => {
    ACCENT_COLORS.forEach(color => {
      expect(color).toHaveProperty('name');
      expect(color).toHaveProperty('hex');
      expect(typeof color.name).toBe('string');
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
