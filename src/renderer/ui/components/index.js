/**
 * UI Components - Central Export
 */

const Modal = require('./Modal');
const Toast = require('./Toast');
const ContextMenu = require('./ContextMenu');
const Tab = require('./Tab');
const ProjectList = require('./ProjectList');
const TerminalManager = require('./TerminalManager');
const CustomizePicker = require('./CustomizePicker');

module.exports = {
  ...Modal,
  ...Toast,
  ...ContextMenu,
  ...Tab,
  ProjectList,
  TerminalManager,
  CustomizePicker
};
