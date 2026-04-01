---
created: 2026-02-25T18:02:39.852Z
title: Implement Markdown Viewer
area: ui
files: []
---

## Problem

The application currently lacks a built-in Markdown viewer/previewer. When users work with Markdown files (.md) in their projects, there is no way to see a rendered preview within Claude Terminal. Users must open an external editor or browser to view formatted Markdown content.

## Solution

Implement a Markdown viewer panel or modal that renders `.md` files with proper formatting. The `marked` package (v17.0.3) is already a dependency, so rendering infrastructure exists. Key considerations:
- Integrate with FileExplorer — clicking/double-clicking a `.md` file could open the viewer
- Support syntax highlighting for fenced code blocks
- Use existing CSS variables for consistent theming
- Consider a split view (source + preview) or toggle mode
