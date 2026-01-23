/**
 * UsageService
 * Fetches Claude Code usage by running /usage command in background
 */

const pty = require('node-pty');
const os = require('os');
const path = require('path');

// Usage data cache
let usageData = null;
let lastFetch = null;
let fetchInterval = null;
let isFetching = false;

// Shell configuration
const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

/**
 * Parse usage output from Claude CLI
 * Extracts: Current session, Current week (all models), Current week (Sonnet only)
 * @param {string} output - Raw terminal output
 * @returns {Object|null} - Parsed usage data
 */
function parseUsageOutput(output) {
  try {
    // Clean ANSI codes from output
    const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    const data = {
      raw: cleanOutput,
      timestamp: new Date().toISOString(),
      session: null,
      weekly: null,
      sonnet: null
    };

    // Split into lines and look for usage patterns
    const lines = cleanOutput.split('\n');

    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect sections
      if (line.includes('Current session')) {
        currentSection = 'session';
      } else if (line.includes('Current week') && line.includes('all models')) {
        currentSection = 'weekly';
      } else if (line.includes('Current week') && line.includes('Sonnet')) {
        currentSection = 'sonnet';
      }

      // Extract percentage from lines containing "% used"
      const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%\s*used/i);
      if (percentMatch && currentSection) {
        data[currentSection] = parseFloat(percentMatch[1]);
        currentSection = null; // Reset after capturing
      }

      // Also check for standalone percentage on next line after section header
      if (currentSection && !percentMatch) {
        const standalonePercent = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (standalonePercent) {
          data[currentSection] = parseFloat(standalonePercent[1]);
          currentSection = null;
        }
      }
    }

    // Fallback: try to find all percentages in order (session, weekly, sonnet)
    if (data.session === null && data.weekly === null && data.sonnet === null) {
      const allPercents = cleanOutput.match(/(\d+(?:\.\d+)?)\s*%\s*used/gi);
      if (allPercents && allPercents.length >= 3) {
        data.session = parseFloat(allPercents[0].match(/(\d+(?:\.\d+)?)/)[1]);
        data.weekly = parseFloat(allPercents[1].match(/(\d+(?:\.\d+)?)/)[1]);
        data.sonnet = parseFloat(allPercents[2].match(/(\d+(?:\.\d+)?)/)[1]);
      }
    }

    return data;
  } catch (error) {
    console.error('Error parsing usage output:', error);
    return { raw: output, error: error.message, session: null, weekly: null, sonnet: null };
  }
}

/**
 * Fetch usage data by running claude /usage
 * @returns {Promise<Object>} - Usage data
 */
function fetchUsage() {
  return new Promise((resolve, reject) => {
    if (isFetching) {
      resolve(usageData);
      return;
    }

    isFetching = true;
    let output = '';
    let resolved = false;
    let claudeStarted = false;
    let usageSent = false;
    let usageComplete = false;
    let exitTimeout = null;

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        isFetching = false;
        ptyProcess.kill();
        // Return partial data if we have any
        if (output.includes('%')) {
          const parsed = parseUsageOutput(output);
          usageData = parsed;
          lastFetch = new Date();
          resolve(parsed);
        } else {
          reject(new Error('Timeout fetching usage'));
        }
      }
    }, 20000); // 20 second timeout

    ptyProcess.onData((data) => {
      output += data;

      // Detect when claude is ready (look for the prompt character or welcome message)
      if (!claudeStarted && (output.includes('╭') || output.includes('>') || output.includes('Claude'))) {
        claudeStarted = true;
        // Small delay before sending /usage
        setTimeout(() => {
          if (!usageSent) {
            usageSent = true;
            ptyProcess.write('/usage\r');
          }
        }, 800);
      }

      // Detect when usage output is complete
      // Look for "esc to cancel" or "Sonnet only" which appear at the end of /usage
      if (usageSent && !usageComplete) {
        if (output.includes('esc to cancel') || output.includes('Sonnet only')) {
          usageComplete = true;
          // Give a moment to capture full output then exit
          if (!exitTimeout) {
            exitTimeout = setTimeout(() => {
              if (!resolved) {
                ptyProcess.write('\x1b'); // Send ESC to close /usage menu
                setTimeout(() => {
                  if (!resolved) {
                    ptyProcess.write('/exit\r');
                  }
                }, 300);
              }
            }, 500);
          }
        }
      }
    });

    ptyProcess.onExit(() => {
      clearTimeout(timeout);
      if (exitTimeout) clearTimeout(exitTimeout);

      if (!resolved) {
        resolved = true;
        isFetching = false;

        // Parse the output
        const parsed = parseUsageOutput(output);
        usageData = parsed;
        lastFetch = new Date();

        resolve(parsed);
      }
    });

    // Start claude
    setTimeout(() => {
      ptyProcess.write('claude\r');
    }, 500);
  });
}

/**
 * Start periodic usage fetching
 * @param {number} intervalMs - Interval in milliseconds (default: 60000 = 1 minute)
 */
function startPeriodicFetch(intervalMs = 60000) {
  // Fetch immediately on start
  fetchUsage().catch(console.error);

  // Then fetch periodically
  if (fetchInterval) {
    clearInterval(fetchInterval);
  }
  fetchInterval = setInterval(() => {
    fetchUsage().catch(console.error);
  }, intervalMs);
}

/**
 * Stop periodic fetching
 */
function stopPeriodicFetch() {
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
}

/**
 * Get cached usage data
 * @returns {Object|null}
 */
function getUsageData() {
  return {
    data: usageData,
    lastFetch: lastFetch ? lastFetch.toISOString() : null,
    isFetching
  };
}

/**
 * Force refresh usage data
 * @returns {Promise<Object>}
 */
async function refreshUsage() {
  return fetchUsage();
}

module.exports = {
  startPeriodicFetch,
  stopPeriodicFetch,
  getUsageData,
  refreshUsage,
  fetchUsage
};
