/**
 * UI Module - Central Export
 */

const components = require('./components');
const themes = require('./themes/terminal-themes');

module.exports = {
  components,
  ...components,
  themes,
  ...themes
};
