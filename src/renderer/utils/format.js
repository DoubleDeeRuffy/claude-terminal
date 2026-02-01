/**
 * Format Utilities
 * Helper functions for formatting data for display
 */

/**
 * Format a date to a relative time string
 * @param {Date|string|number} date - Date to format
 * @returns {string} - Relative time string (e.g., "2 hours ago")
 */
function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  return 'just now';
}

/**
 * Format duration in milliseconds to readable string
 * @param {number} ms - Duration in milliseconds
 * @param {Object} [options] - Formatting options
 * @param {boolean} [options.showSeconds=false] - Show seconds when duration > 1 min
 * @param {boolean} [options.compact=false] - Compact format without spaces (e.g., "2h30")
 * @param {boolean} [options.alwaysShowMinutes=true] - Show "0m" for sub-minute durations instead of seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms, options = {}) {
  const { showSeconds = false, compact = false, alwaysShowMinutes = true } = options;

  if (!ms || ms < 0) ms = 0;

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  const sep = compact ? '' : ' ';

  if (hours > 0) {
    if (minutes > 0) {
      return compact ? `${hours}h${minutes.toString().padStart(2, '0')}` : `${hours}h${sep}${minutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    if (showSeconds && seconds > 0) {
      return `${minutes}m${sep}${seconds}s`;
    }
    return `${minutes}m`;
  }

  // Sub-minute
  if (alwaysShowMinutes) {
    return '0m';
  }
  return seconds > 0 ? `${seconds}s` : '0s';
}

/**
 * Format duration for large hero displays
 * @param {number} ms - Duration in milliseconds
 * @returns {{ hours: number, minutes: number }}
 */
function formatDurationLarge(ms) {
  if (!ms || ms < 0) ms = 0;
  return {
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000)
  };
}

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  formatRelativeTime,
  formatDuration,
  formatDurationLarge,
  capitalize
};
