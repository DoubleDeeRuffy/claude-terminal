# Claude Terminal

Application Windows pour gérer vos projets Claude Code avec une interface moderne.

## Fonctionnalités

- **Onglet Claude**: Gérez vos projets et lancez plusieurs instances de Claude Code
- **Onglet Skills**: Visualisez et créez des skills personnalisés
- **Onglet Agents**: Visualisez et créez des agents personnalisés

## Installation

```bash
# Installer les dépendances
npm install

# Lancer l'application
npm start
```

## Prérequis

- Node.js 18+
- Claude Code installé globalement (`npm install -g @anthropic-ai/claude-code`)
- Windows 10/11

## Structure

```
ClaudeTerminal/
├── main.js          # Process principal Electron
├── renderer.js      # Logique de l'interface
├── index.html       # Interface HTML
├── styles.css       # Styles
├── package.json     # Dépendances
└── assets/          # Ressources
```
