/**
 * Electron Builder Configuration
 * Utilise les variables d'environnement pour les données sensibles
 */

module.exports = {
  appId: "com.yanis.claude-terminal",
  productName: "Claude Terminal",
  directories: {
    output: "dist"
  },
  files: [
    "main.js",
    "renderer.js",
    "index.html",
    "quick-picker.html",
    "styles.css",
    "src/**/*",
    "assets/**/*",
    "node_modules/**/*",
    "package.json"
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "assets/icon.ico"
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    differentialPackage: true
  },
  publish: {
    provider: "generic",
    url: process.env.UPDATE_SERVER_URL,
    useMultipleRangeRequest: false
  }
};
