/**
 * Menu Section Component
 * Groups menu items with optional section headers
 */

function createMenuSection(title, items) {
  if (!items || items.length === 0) return '';

  const itemsHtml = items.join('\n');

  if (title) {
    return `
      <div class="menu-section">
        <div class="menu-section-header">${title}</div>
        ${itemsHtml}
      </div>
    `;
  }

  return itemsHtml;
}

module.exports = { createMenuSection };