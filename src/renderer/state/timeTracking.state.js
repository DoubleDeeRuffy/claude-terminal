/**
 * Time Tracking State Module
 * Tracks time spent on each project based on terminal activity
 * Supports multiple projects being tracked simultaneously
 *
 * Persisted data lives in timetracking.json (separate from projects.json)
 */

const { fs } = window.electron_nodeModules;
const { State } = require('./State');
const { timeTrackingFile, projectsFile } = require('../utils/paths');
const ArchiveService = require('../services/ArchiveService');

// Constants
const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const OUTPUT_IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes - idle after last terminal output
const SLEEP_GAP_THRESHOLD = 2 * 60 * 1000; // 2 minutes - gap indicating system sleep/wake
const CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5 minutes - periodic session save
const SESSION_MERGE_GAP = 30 * 60 * 1000; // 30 minutes - merge sessions closer than this
const TT_SAVE_DEBOUNCE_MS = 500;
let lastHeartbeat = Date.now();
let heartbeatTimer = null;
let checkpointTimer = null;

// Runtime state (not persisted)
const trackingState = new State({
  activeSessions: new Map(),
  globalSessionStartTime: null,
  globalLastActivityTime: null,
  globalIsIdle: false
});

// Persisted time tracking data (separate file: timetracking.json)
const timeTrackingDataState = new State({
  projects: {},  // projectId -> { totalTime, todayTime, lastActiveDate, sessions[] }
  global: null   // { totalTime, todayTime, weekTime, monthTime, weekStart, monthStart, lastActiveDate, sessions[] }
});

// Internal state
const idleTimers = new Map();
const lastOutputTimes = new Map();
let globalLastOutputTime = 0;
let globalIdleTimer = null;
let midnightCheckTimer = null;
let lastKnownDate = null;
let projectsStateRef = null; // Still needed for project metadata (name, color)
let globalTimesCache = null;
let globalTimesCacheDate = null;
let ttSaveDebounceTimer = null;
let ttSaveInProgress = false;
let ttPendingSave = false;

// ============================================================
// TIME TRACKING PERSISTENCE (timetracking.json)
// ============================================================

/**
 * Load time tracking data from timetracking.json
 */
async function loadTimeTrackingData() {
  try {
    if (!fs.existsSync(timeTrackingFile)) return;

    const content = await fs.promises.readFile(timeTrackingFile, 'utf8');
    if (!content || !content.trim()) return;

    const data = JSON.parse(content);
    timeTrackingDataState.set({
      projects: data.projects || {},
      global: data.global || null
    });
    console.debug('[TimeTracking] Loaded timetracking.json');
  } catch (error) {
    console.warn('[TimeTracking] Failed to load timetracking.json:', error.message);
  }
}

/**
 * Save time tracking data (debounced)
 */
function saveTimeTracking() {
  if (ttSaveDebounceTimer) {
    clearTimeout(ttSaveDebounceTimer);
  }

  ttSaveDebounceTimer = setTimeout(() => {
    if (ttSaveInProgress) {
      ttPendingSave = true;
      return;
    }
    saveTimeTrackingImmediate();
  }, TT_SAVE_DEBOUNCE_MS);
}

/**
 * Save time tracking data immediately (atomic write)
 */
function saveTimeTrackingImmediate() {
  if (ttSaveInProgress) {
    ttPendingSave = true;
    return;
  }

  ttSaveInProgress = true;

  const state = timeTrackingDataState.get();
  const data = {
    version: 2,
    month: getMonthString(),
    global: state.global,
    projects: state.projects
  };

  const tempFile = `${timeTrackingFile}.tmp`;
  const backupFile = `${timeTrackingFile}.bak`;

  try {
    if (fs.existsSync(timeTrackingFile)) {
      try { fs.copyFileSync(timeTrackingFile, backupFile); } catch (_) {}
    }

    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, timeTrackingFile);

    try { if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile); } catch (_) {}
  } catch (error) {
    console.error('[TimeTracking] Failed to save timetracking.json:', error.message);
    if (fs.existsSync(backupFile)) {
      try { fs.copyFileSync(backupFile, timeTrackingFile); } catch (_) {}
    }
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
  } finally {
    ttSaveInProgress = false;
    if (ttPendingSave) {
      ttPendingSave = false;
      setTimeout(saveTimeTrackingImmediate, 50);
    }
  }
}

// ============================================================
// MIGRATION
// ============================================================

/**
 * Migrate inline timeTracking from projects.json to timetracking.json
 * One-time migration for existing users
 */
async function migrateInlineTimeTracking() {
  // Read projects.json RAW from disk (not from state, which no longer includes timeTracking fields)
  let rawData;
  try {
    if (!fs.existsSync(projectsFile)) return;
    const content = await fs.promises.readFile(projectsFile, 'utf8');
    if (!content || !content.trim()) return;
    rawData = JSON.parse(content);
  } catch (e) {
    console.warn('[TimeTracking] Cannot read projects.json for migration:', e.message);
    return;
  }

  const projects = rawData.projects || (Array.isArray(rawData) ? rawData : []);
  let hasInlineData = false;
  const ttState = timeTrackingDataState.get();
  const migratedProjects = { ...ttState.projects };
  let migratedGlobal = ttState.global;

  // Extract per-project timeTracking
  for (const project of projects) {
    if (project.timeTracking) {
      hasInlineData = true;
      const existing = migratedProjects[project.id];
      if (!existing) {
        migratedProjects[project.id] = { ...project.timeTracking };
      } else {
        // Merge: deduplicate sessions, then recalculate counters from sessions
        const mergedSessions = deduplicateSessions(existing.sessions || [], project.timeTracking.sessions || []);
        let total = 0;
        for (const s of mergedSessions) total += s.duration || 0;
        migratedProjects[project.id] = {
          totalTime: total,
          todayTime: 0, // Will be recalculated by compactExistingSessions
          lastActiveDate: existing.lastActiveDate || project.timeTracking.lastActiveDate,
          sessions: mergedSessions
        };
      }
    }
  }

  // Extract globalTimeTracking
  if (rawData.globalTimeTracking) {
    hasInlineData = true;
    if (!migratedGlobal) {
      migratedGlobal = { ...rawData.globalTimeTracking };
    } else {
      // Merge: deduplicate sessions, counters will be recalculated by compactExistingSessions
      const mergedSessions = deduplicateSessions(migratedGlobal.sessions || [], rawData.globalTimeTracking.sessions || []);
      let total = 0;
      for (const s of mergedSessions) total += s.duration || 0;
      migratedGlobal = {
        ...migratedGlobal,
        totalTime: total,
        todayTime: 0,
        weekTime: 0,
        monthTime: 0,
        lastActiveDate: migratedGlobal.lastActiveDate || rawData.globalTimeTracking.lastActiveDate,
        weekStart: migratedGlobal.weekStart || rawData.globalTimeTracking.weekStart,
        monthStart: migratedGlobal.monthStart || rawData.globalTimeTracking.monthStart,
        sessions: mergedSessions
      };
    }
  }

  if (!hasInlineData) return;

  // 0. Backup projects.json before any migration changes
  const backupFile = `${projectsFile}.pre-migration.bak`;
  try {
    fs.copyFileSync(projectsFile, backupFile);
    console.debug('[TimeTracking] Backup created:', backupFile);
  } catch (e) {
    console.warn('[TimeTracking] Failed to backup projects.json, aborting migration:', e.message);
    return;
  }

  // 1. Save to timetracking.json FIRST (safety)
  timeTrackingDataState.set({ projects: migratedProjects, global: migratedGlobal });
  saveTimeTrackingImmediate();

  // 2. Strip timeTracking from projects.json (both state and disk)
  const cleanedProjects = projects.map(p => {
    if (!p.timeTracking) return p;
    const { timeTracking, ...rest } = p;
    return rest;
  });

  // Update state
  if (projectsStateRef) {
    const currentState = projectsStateRef.get();
    const stateProjects = currentState.projects.map(p => {
      if (!p.timeTracking) return p;
      const { timeTracking, ...rest } = p;
      return rest;
    });
    projectsStateRef.set({ ...currentState, projects: stateProjects });
  }

  // Write cleaned projects.json directly
  const cleanedData = { ...rawData, projects: cleanedProjects };
  delete cleanedData.globalTimeTracking;
  const tempFile = `${projectsFile}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(cleanedData, null, 2));
    fs.renameSync(tempFile, projectsFile);
  } catch (e) {
    console.warn('[TimeTracking] Failed to clean projects.json:', e.message);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
  }

  console.debug('[TimeTracking] Migrated inline data to timetracking.json');
}

/**
 * Deduplicate sessions by ID, keeping the version with the latest endTime
 */
function deduplicateSessions(existing, incoming) {
  const byId = new Map();
  for (const s of existing) {
    byId.set(s.id, s);
  }
  for (const s of incoming) {
    const prev = byId.get(s.id);
    if (!prev) {
      byId.set(s.id, s);
    } else {
      // Keep the version with the latest endTime (most up-to-date)
      const prevEnd = new Date(prev.endTime).getTime();
      const sEnd = new Date(s.endTime).getTime();
      if (sEnd > prevEnd) byId.set(s.id, s);
    }
  }
  return Array.from(byId.values());
}

/**
 * Remove orphaned time tracking entries for deleted projects
 */
function cleanupOrphanedTimeTracking() {
  if (!projectsStateRef) return;

  const projectIds = new Set(projectsStateRef.get().projects.map(p => p.id));
  const ttState = timeTrackingDataState.get();
  const cleaned = {};
  let hasOrphans = false;

  for (const [id, data] of Object.entries(ttState.projects)) {
    if (projectIds.has(id)) {
      cleaned[id] = data;
    } else {
      hasOrphans = true;
    }
  }

  if (hasOrphans) {
    timeTrackingDataState.set({ ...ttState, projects: cleaned });
    saveTimeTracking();
    console.debug('[TimeTracking] Cleaned up orphaned time tracking entries');
  }
}

// ============================================================
// SANITIZATION
// ============================================================

/**
 * Sanitize and validate all time tracking data on load
 */
function sanitizeTimeTrackingData() {
  const ttState = timeTrackingDataState.get();
  let needsSave = false;
  const now = Date.now();
  const maxReasonableDuration = 24 * 60 * 60 * 1000;

  // Sanitize per-project time tracking
  const projects = { ...ttState.projects };
  for (const [projectId, tracking] of Object.entries(projects)) {
    const sanitized = { ...tracking };
    let changed = false;

    if (!Number.isFinite(sanitized.totalTime) || sanitized.totalTime < 0) {
      console.warn(`[TimeTracking] Sanitize: project ${projectId} totalTime was ${sanitized.totalTime}, reset to 0`);
      sanitized.totalTime = 0;
      changed = true;
    }

    if (!Number.isFinite(sanitized.todayTime) || sanitized.todayTime < 0) {
      sanitized.todayTime = 0;
      changed = true;
    }

    if (sanitized.lastActiveDate) {
      const lastDate = new Date(sanitized.lastActiveDate + 'T00:00:00');
      if (lastDate.getTime() > now + 86400000) {
        sanitized.lastActiveDate = null;
        sanitized.todayTime = 0;
        changed = true;
      }
    }

    if (Array.isArray(sanitized.sessions)) {
      const validSessions = sanitized.sessions.filter(s => {
        if (!s || !s.startTime || !s.endTime) return false;
        if (!Number.isFinite(s.duration) || s.duration <= 0) return false;
        if (s.duration > maxReasonableDuration) return false;
        const start = new Date(s.startTime).getTime();
        const end = new Date(s.endTime).getTime();
        if (isNaN(start) || isNaN(end)) return false;
        if (end < start) return false;
        return true;
      });

      if (validSessions.length !== sanitized.sessions.length) {
        console.warn(`[TimeTracking] Sanitize: project ${projectId} removed ${sanitized.sessions.length - validSessions.length} invalid sessions`);
        sanitized.sessions = validSessions;
        changed = true;
      }
    } else {
      sanitized.sessions = [];
      changed = true;
    }

    if (changed) {
      projects[projectId] = sanitized;
      needsSave = true;
    }
  }

  // Sanitize global time tracking
  let global = ttState.global;
  if (global) {
    global = { ...global };
    let gChanged = false;

    for (const key of ['totalTime', 'todayTime', 'weekTime', 'monthTime']) {
      if (!Number.isFinite(global[key]) || global[key] < 0) {
        global[key] = 0;
        gChanged = true;
      }
    }

    if (Array.isArray(global.sessions)) {
      const validSessions = global.sessions.filter(s => {
        if (!s || !s.startTime || !s.endTime) return false;
        if (!Number.isFinite(s.duration) || s.duration <= 0) return false;
        if (s.duration > maxReasonableDuration) return false;
        const start = new Date(s.startTime).getTime();
        const end = new Date(s.endTime).getTime();
        if (isNaN(start) || isNaN(end)) return false;
        if (end < start) return false;
        return true;
      });

      if (validSessions.length !== global.sessions.length) {
        console.warn(`[TimeTracking] Sanitize: global removed ${global.sessions.length - validSessions.length} invalid sessions`);
        global.sessions = validSessions;
        gChanged = true;
      }
    } else {
      global.sessions = [];
      gChanged = true;
    }

    if (gChanged) needsSave = true;
  }

  if (needsSave) {
    globalTimesCache = null;
    timeTrackingDataState.set({ projects, global });
    saveTimeTracking();
    console.debug('[TimeTracking] Data sanitized and saved');
  }
}

// ============================================================
// ARCHIVING
// ============================================================

/**
 * Archive past-month sessions to monthly archive files
 */
async function archivePastMonthSessions() {
  const ttState = timeTrackingDataState.get();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let hasChanges = false;

  // --- Archive global sessions ---
  let updatedGlobal = ttState.global;
  if (updatedGlobal?.sessions?.length > 0) {
    const currentMonthGlobal = [];
    const pastByMonth = {};

    for (const session of updatedGlobal.sessions) {
      const d = new Date(session.startTime);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        currentMonthGlobal.push(session);
      } else {
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!pastByMonth[key]) pastByMonth[key] = [];
        pastByMonth[key].push(session);
      }
    }

    if (Object.keys(pastByMonth).length > 0) {
      hasChanges = true;
      updatedGlobal = { ...updatedGlobal, sessions: currentMonthGlobal };
    }

    for (const [key, sessions] of Object.entries(pastByMonth)) {
      const [year, month] = key.split('-').map(Number);
      await ArchiveService.appendToArchive(year, month, sessions, {});
    }
  }

  // --- Archive per-project sessions ---
  const pastProjectsByMonth = {};
  const updatedProjects = { ...ttState.projects };
  const projectsData = projectsStateRef ? projectsStateRef.get().projects : [];

  for (const [projectId, tracking] of Object.entries(updatedProjects)) {
    if (!tracking?.sessions?.length) continue;

    const currentMonthSessions = [];
    for (const session of tracking.sessions) {
      const d = new Date(session.startTime);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        currentMonthSessions.push(session);
      } else {
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!pastProjectsByMonth[key]) pastProjectsByMonth[key] = {};
        const project = projectsData.find(p => p.id === projectId);
        if (!pastProjectsByMonth[key][projectId]) {
          pastProjectsByMonth[key][projectId] = { projectName: project?.name || 'Unknown', sessions: [] };
        }
        pastProjectsByMonth[key][projectId].sessions.push(session);
      }
    }

    if (currentMonthSessions.length !== tracking.sessions.length) {
      hasChanges = true;
      // Recalculate totalTime from remaining sessions (archived ones are removed)
      let newTotal = 0;
      for (const s of currentMonthSessions) newTotal += s.duration || 0;
      updatedProjects[projectId] = { ...tracking, sessions: currentMonthSessions, totalTime: newTotal };
    }
  }

  for (const [key, projectsMap] of Object.entries(pastProjectsByMonth)) {
    const [year, month] = key.split('-').map(Number);
    await ArchiveService.appendToArchive(year, month, [], projectsMap);
  }

  if (hasChanges) {
    globalTimesCache = null;
    timeTrackingDataState.set({ projects: updatedProjects, global: updatedGlobal });
    saveTimeTracking();
    console.debug('[TimeTracking] Archived past-month sessions');
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize with references to projects state functions
 */
async function initTimeTracking(projectsState) {
  projectsStateRef = projectsState;
  console.debug('[TimeTracking] Initialized');

  // 1. Migrate old archives/ to timetracking/YYYY/
  await ArchiveService.migrateOldArchives();

  // 2. Load timetracking.json
  await loadTimeTrackingData();

  // 3. Migrate inline timeTracking from projects.json (reads disk directly)
  await migrateInlineTimeTracking();

  // 4. Sanitize data
  sanitizeTimeTrackingData();

  // 5. Migrate global counters (weekTime/monthTime)
  migrateGlobalTimeTracking();

  // 6. Archive past-month sessions
  await archivePastMonthSessions();

  // 7. Restore global sessions from backup if missing
  await rebuildGlobalSessionsIfNeeded();

  // 8. Compact fragmented sessions (merge consecutive, preserves total time)
  compactExistingSessions();

  // 9. Cleanup orphaned entries
  cleanupOrphanedTimeTracking();

  // 10. Start timers
  lastKnownDate = getTodayString();
  startMidnightCheck();
  startHeartbeat();
  startCheckpointTimer();
}

/**
 * Migrate global time tracking to use weekTime/monthTime counters
 */
function migrateGlobalTimeTracking() {
  const ttState = timeTrackingDataState.get();
  const globalTracking = ttState.global;

  if (!globalTracking) return;

  const weekStart = getWeekStartString();
  const monthStart = getMonthString();
  let needsSave = false;

  const needsWeekMigration = globalTracking.weekTime === undefined || globalTracking.weekStart !== weekStart;
  const needsMonthMigration = globalTracking.monthTime === undefined || globalTracking.monthStart !== monthStart;

  if (needsWeekMigration || needsMonthMigration) {
    const updated = { ...globalTracking };
    const sessions = globalTracking.sessions || [];

    // Always recalculate todayTime and totalTime from sessions
    const todayStr = getTodayString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    let todayFromSessions = 0, totalFromSessions = 0;
    for (const session of sessions) {
      const dur = session.duration || 0;
      totalFromSessions += dur;
      const d = new Date(session.startTime);
      if (d >= todayStart && d < todayEnd) todayFromSessions += dur;
    }
    updated.todayTime = todayFromSessions;
    updated.totalTime = totalFromSessions;
    updated.lastActiveDate = todayStr;

    if (needsWeekMigration) {
      const weekStartDate = new Date(weekStart + 'T00:00:00');
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 7);

      let weekFromSessions = 0;
      for (const session of sessions) {
        const sessionDate = new Date(session.startTime);
        if (sessionDate >= weekStartDate && sessionDate < weekEndDate) {
          weekFromSessions += session.duration || 0;
        }
      }

      // Always use session-based calculation as source of truth
      updated.weekTime = weekFromSessions;
      updated.weekStart = weekStart;
      needsSave = true;
    }

    if (needsMonthMigration) {
      const [year, month] = monthStart.split('-').map(Number);

      let monthFromSessions = 0;
      for (const session of sessions) {
        const sessionDate = new Date(session.startTime);
        if (sessionDate.getFullYear() === year && sessionDate.getMonth() + 1 === month) {
          monthFromSessions += session.duration || 0;
        }
      }

      // Always use session-based calculation as source of truth
      updated.monthTime = monthFromSessions;
      updated.monthStart = monthStart;
      needsSave = true;
    }

    if (needsSave) {
      globalTimesCache = null;
      timeTrackingDataState.set({ ...ttState, global: updated });
      saveTimeTracking();
    }
  }
}

// ============================================================
// TIMERS (midnight, heartbeat, checkpoint)
// ============================================================

function startMidnightCheck() {
  clearInterval(midnightCheckTimer);
  midnightCheckTimer = setInterval(checkMidnightReset, 30 * 1000);
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  lastHeartbeat = Date.now();
  heartbeatTimer = setInterval(checkSleepWake, 30 * 1000);
}

function startCheckpointTimer() {
  clearInterval(checkpointTimer);
  checkpointTimer = setInterval(saveCheckpoints, CHECKPOINT_INTERVAL);
}

async function saveCheckpoints() {
  const state = trackingState.get();
  const now = Date.now();
  const activeSessions = new Map(state.activeSessions);
  let projectsChanged = false;

  for (const [projectId, session] of activeSessions) {
    if (session.sessionStartTime && !session.isIdle) {
      const duration = now - session.sessionStartTime;
      if (duration > 1000) {
        await saveSession(projectId, session.sessionStartTime, now, duration);
        activeSessions.set(projectId, { ...session, sessionStartTime: now });
        projectsChanged = true;
      }
    }
  }

  let globalChanged = false;
  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const duration = now - state.globalSessionStartTime;
    if (duration > 1000) {
      await saveGlobalSession(state.globalSessionStartTime, now, duration);
      globalChanged = true;
    }
  }

  if (projectsChanged || globalChanged) {
    const newState = { ...trackingState.get() };
    if (projectsChanged) newState.activeSessions = activeSessions;
    if (globalChanged) newState.globalSessionStartTime = now;
    trackingState.set(newState);
    console.debug('[TimeTracking] Checkpoint saved');
  }
}

async function checkSleepWake() {
  const now = Date.now();
  const elapsed = now - lastHeartbeat;
  lastHeartbeat = now;

  if (elapsed > SLEEP_GAP_THRESHOLD) {
    console.debug(`[TimeTracking] Sleep/wake detected: gap of ${Math.round(elapsed / 1000)}s`);
    await handleSleepWake(now - elapsed, now);
  }
}

async function handleSleepWake(sleepStart, wakeTime) {
  const state = trackingState.get();

  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const duration = sleepStart - state.globalSessionStartTime;
    if (duration > 1000) {
      await saveGlobalSession(state.globalSessionStartTime, sleepStart, duration);
    }
    trackingState.set({
      ...trackingState.get(),
      globalSessionStartTime: wakeTime,
      globalLastActivityTime: wakeTime
    });
  }

  const activeSessions = new Map(trackingState.get().activeSessions);
  for (const [projectId, session] of activeSessions) {
    if (session.sessionStartTime && !session.isIdle) {
      const duration = sleepStart - session.sessionStartTime;
      if (duration > 1000) {
        await saveSession(projectId, session.sessionStartTime, sleepStart, duration);
      }
      activeSessions.set(projectId, {
        ...session,
        sessionStartTime: wakeTime,
        lastActivityTime: wakeTime
      });
    }
  }

  trackingState.set({ ...trackingState.get(), activeSessions });
}

async function checkMidnightReset() {
  const today = getTodayString();

  if (lastKnownDate && lastKnownDate !== today) {
    console.debug('[TimeTracking] Midnight detected! Date changed from', lastKnownDate, 'to', today);

    const oldDate = new Date(lastKnownDate + 'T00:00:00');
    const newDate = new Date(today + 'T00:00:00');
    const monthChanged = oldDate.getMonth() !== newDate.getMonth()
      || oldDate.getFullYear() !== newDate.getFullYear();

    lastKnownDate = today;
    globalTimesCache = null;
    await splitSessionsAtMidnight();

    if (monthChanged) {
      console.debug('[TimeTracking] Month boundary crossed, archiving past sessions');
      await archivePastMonthSessions();
    }
  }
}

async function splitSessionsAtMidnight() {
  const state = trackingState.get();
  const now = Date.now();
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const midnightTs = todayMidnight.getTime();

  // Save pre-midnight segments using yesterday's date context
  // by passing endTime = midnightTs - 1ms so saveGlobalSession/saveSession
  // attribute the time to the correct day/week/month
  const preMidnight = midnightTs - 1;

  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const duration = preMidnight - state.globalSessionStartTime;
    if (duration > 1000) {
      await saveGlobalSessionAt(state.globalSessionStartTime, preMidnight, duration, new Date(preMidnight));
    }
    trackingState.set({
      ...trackingState.get(),
      globalSessionStartTime: midnightTs,
      globalLastActivityTime: now
    });
  }

  const activeSessions = new Map(trackingState.get().activeSessions);
  for (const [projectId, session] of activeSessions) {
    if (session.sessionStartTime && !session.isIdle) {
      const duration = preMidnight - session.sessionStartTime;
      if (duration > 1000) {
        await saveSessionAt(projectId, session.sessionStartTime, preMidnight, duration, new Date(preMidnight));
      }
      activeSessions.set(projectId, {
        ...session,
        sessionStartTime: midnightTs,
        lastActivityTime: now
      });
    }
  }

  trackingState.set({ ...trackingState.get(), activeSessions });
}

// ============================================================
// HELPERS
// ============================================================

function getTodayString() {
  return getDateString(new Date());
}

function getDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStartString() {
  return getWeekStartStringForDate(new Date());
}

function getWeekStartStringForDate(date) {
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getMonthString() {
  return getMonthStringForDate(new Date());
}

function getMonthStringForDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ensure time tracking data exists for a project
 */
function ensureTimeTracking(project) {
  if (!project) return { totalTime: 0, todayTime: 0, lastActiveDate: null, sessions: [] };

  const ttState = timeTrackingDataState.get();
  if (!ttState.projects[project.id]) {
    const tracking = { totalTime: 0, todayTime: 0, lastActiveDate: null, sessions: [] };
    timeTrackingDataState.set({
      ...ttState,
      projects: { ...ttState.projects, [project.id]: tracking }
    });
    return tracking;
  }
  return ttState.projects[project.id];
}

function getProjectById(projectId) {
  if (!projectsStateRef) return undefined;
  return projectsStateRef.get().projects.find(p => p.id === projectId);
}

function generateSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getActiveNonIdleCount() {
  const state = trackingState.get();
  let count = 0;
  for (const session of state.activeSessions.values()) {
    if (session.sessionStartTime && !session.isIdle) count++;
  }
  return count;
}

// ============================================================
// GLOBAL TIMER
// ============================================================

function startGlobalTimer() {
  const state = trackingState.get();
  if (state.globalSessionStartTime && !state.globalIsIdle) return;

  const now = Date.now();
  trackingState.set({
    ...state,
    globalSessionStartTime: now,
    globalLastActivityTime: now,
    globalIsIdle: false
  });

  clearTimeout(globalIdleTimer);
  globalIdleTimer = setTimeout(checkAndPauseGlobalTimer, IDLE_TIMEOUT);
  console.debug('[TimeTracking] Global timer started');
}

async function pauseGlobalTimer() {
  const state = trackingState.get();
  if (!state.globalSessionStartTime || state.globalIsIdle) return;

  const now = Date.now();
  const duration = now - state.globalSessionStartTime;
  if (duration > 1000) {
    await saveGlobalSession(state.globalSessionStartTime, now, duration);
  }

  trackingState.set({ ...state, globalSessionStartTime: null, globalIsIdle: true });
  console.debug('[TimeTracking] Global timer paused (idle)');
}

function resumeGlobalTimer() {
  const state = trackingState.get();
  if (!state.globalIsIdle) return;

  const now = Date.now();
  trackingState.set({
    ...state,
    globalSessionStartTime: now,
    globalLastActivityTime: now,
    globalIsIdle: false
  });

  clearTimeout(globalIdleTimer);
  globalIdleTimer = setTimeout(checkAndPauseGlobalTimer, IDLE_TIMEOUT);
  console.debug('[TimeTracking] Global timer resumed');
}

async function stopGlobalTimer() {
  const state = trackingState.get();
  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const now = Date.now();
    const duration = now - state.globalSessionStartTime;
    if (duration > 1000) {
      await saveGlobalSession(state.globalSessionStartTime, now, duration);
    }
  }

  clearTimeout(globalIdleTimer);
  trackingState.set({
    ...state,
    globalSessionStartTime: null,
    globalLastActivityTime: null,
    globalIsIdle: false
  });
  console.debug('[TimeTracking] Global timer stopped');
}

function resetGlobalIdleTimer() {
  const state = trackingState.get();
  if (state.globalIsIdle) {
    resumeGlobalTimer();
    return;
  }

  if (state.globalSessionStartTime) {
    clearTimeout(globalIdleTimer);
    globalIdleTimer = setTimeout(checkAndPauseGlobalTimer, IDLE_TIMEOUT);
    trackingState.set({ ...state, globalLastActivityTime: Date.now() });
  }
}

// ============================================================
// SESSION MERGING
// ============================================================

/**
 * Merge a new session segment into the last session if close enough, otherwise append.
 * This prevents checkpoint intervals from creating hundreds of micro-sessions.
 */
function mergeOrAppendSession(sessions, startTime, endTime, duration) {
  const startIso = new Date(startTime).toISOString();
  const endIso = new Date(endTime).toISOString();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1];
    const lastStart = new Date(last.startTime).getTime();
    const lastEnd = new Date(last.endTime).getTime();
    const gap = startMs - lastEnd;

    if (gap < SESSION_MERGE_GAP && gap >= 0) {
      // Adjacent/close sessions: extend and sum durations
      const merged = [...sessions];
      merged[merged.length - 1] = {
        ...last,
        endTime: endIso,
        duration: (last.duration || 0) + duration
      };
      return merged;
    }

    if (gap < 0 && startMs >= lastStart) {
      // Overlapping session: merge without double-counting
      const merged = [...sessions];
      const mergedEnd = Math.max(lastEnd, endMs);
      merged[merged.length - 1] = {
        ...last,
        endTime: new Date(mergedEnd).toISOString(),
        duration: mergedEnd - lastStart
      };
      return merged;
    }
  }

  // Too far apart or first session - create new
  return [...sessions, {
    id: generateSessionId(),
    startTime: startIso,
    endTime: endIso,
    duration
  }];
}

/**
 * Compact existing sessions by merging consecutive ones with small gaps.
 * This reduces file size without losing any time data (durations are summed).
 */
function compactExistingSessions() {
  const ttState = timeTrackingDataState.get();
  let totalBefore = 0;
  let totalAfter = 0;

  const now = new Date();
  const todayStr = getTodayString();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

  const compactedProjects = {};
  for (const [projectId, tracking] of Object.entries(ttState.projects)) {
    const sessions = tracking.sessions || [];
    totalBefore += sessions.length;
    const compacted = compactSessionArray(sessions);
    totalAfter += compacted.length;

    // Recalculate project counters from compacted sessions
    let projTotal = 0, projToday = 0;
    for (const s of compacted) {
      const dur = s.duration || 0;
      projTotal += dur;
      const d = new Date(s.startTime);
      if (d >= todayStart && d < todayEnd) projToday += dur;
    }
    compactedProjects[projectId] = {
      ...tracking,
      sessions: compacted,
      totalTime: projTotal,
      todayTime: projToday,
      lastActiveDate: todayStr
    };
  }

  let compactedGlobal = ttState.global;
  if (compactedGlobal?.sessions?.length) {
    totalBefore += compactedGlobal.sessions.length;
    const compacted = compactSessionArray(compactedGlobal.sessions);
    totalAfter += compacted.length;
    compactedGlobal = { ...compactedGlobal, sessions: compacted };

    // Recalculate stored counters from compacted sessions to fix drift
    const now = new Date();
    const todayStr = getTodayString();
    const weekStartStr = getWeekStartString();
    const monthStartStr = getMonthString();

    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const day = now.getDay();
    const diffToMon = day === 0 ? 6 : day - 1;
    const weekStartDate = new Date(now); weekStartDate.setDate(weekStartDate.getDate() - diffToMon); weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate); weekEndDate.setDate(weekEndDate.getDate() + 7);
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let globalTotal = 0, todayTime = 0, weekTime = 0, monthTime = 0;
    for (const s of compacted) {
      const d = new Date(s.startTime);
      const dur = s.duration || 0;
      globalTotal += dur;
      if (d >= todayStart && d < todayEnd) todayTime += dur;
      if (d >= weekStartDate && d < weekEndDate) weekTime += dur;
      if (d >= monthStartDate && d < monthEndDate) monthTime += dur;
    }
    compactedGlobal.totalTime = globalTotal;
    compactedGlobal.todayTime = todayTime;
    compactedGlobal.weekTime = weekTime;
    compactedGlobal.monthTime = monthTime;
    compactedGlobal.lastActiveDate = todayStr;
    compactedGlobal.weekStart = weekStartStr;
    compactedGlobal.monthStart = monthStartStr;
  }

  if (totalAfter < totalBefore) {
    globalTimesCache = null;
    timeTrackingDataState.set({ projects: compactedProjects, global: compactedGlobal });
    saveTimeTracking();
    console.debug(`[TimeTracking] Compacted sessions: ${totalBefore} -> ${totalAfter}`);
  }
}

/**
 * Merge an array of sessions, combining consecutive ones with gap < SESSION_MERGE_GAP.
 * Total duration is preserved (durations are summed, not recalculated).
 */
function compactSessionArray(sessions) {
  if (!sessions.length) return [];

  const sorted = [...sessions].sort((a, b) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const result = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    const lastStart = new Date(last.startTime).getTime();
    const lastEnd = new Date(last.endTime).getTime();
    const currentStart = new Date(current.startTime).getTime();
    const currentEnd = new Date(current.endTime).getTime();
    const gap = currentStart - lastEnd;

    if (gap < SESSION_MERGE_GAP && gap >= 0) {
      // Adjacent or close sessions: extend and sum durations
      last.endTime = current.endTime;
      last.duration = (last.duration || 0) + (current.duration || 0);
    } else if (gap < 0) {
      // Overlapping sessions: merge without double-counting
      const mergedEnd = Math.max(lastEnd, currentEnd);
      last.endTime = new Date(mergedEnd).toISOString();
      // Recalculate duration from merged wall-clock time
      last.duration = mergedEnd - lastStart;
    } else {
      result.push({ ...current });
    }
  }

  return result;
}

/**
 * Restore global sessions from pre-migration backup if current data looks wrong.
 * The backup file (projects.json.pre-migration.bak) contains the original globalTimeTracking
 * with correct wall-clock times (no double-counting from overlapping project sessions).
 */
async function rebuildGlobalSessionsIfNeeded() {
  const ttState = timeTrackingDataState.get();
  const globalSessions = ttState.global?.sessions || [];

  // If we already have global sessions, don't overwrite them
  if (globalSessions.length > 0) return;

  // Try to restore from pre-migration backup
  const backupFile = `${projectsFile}.pre-migration.bak`;
  try {
    if (!fs.existsSync(backupFile)) {
      console.debug('[TimeTracking] No pre-migration backup found, skipping global restore');
      return;
    }

    const content = await fs.promises.readFile(backupFile, 'utf8');
    if (!content || !content.trim()) return;

    const backupData = JSON.parse(content);
    const backupGlobal = backupData.globalTimeTracking;

    if (!backupGlobal || !backupGlobal.sessions || backupGlobal.sessions.length === 0) {
      console.debug('[TimeTracking] Backup has no global sessions');
      return;
    }

    // Filter to current month only (past months should already be archived)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentMonthSessions = backupGlobal.sessions.filter(s => {
      const d = new Date(s.startTime);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    // Archive past-month sessions from backup
    const pastByMonth = {};
    for (const session of backupGlobal.sessions) {
      const d = new Date(session.startTime);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!pastByMonth[key]) pastByMonth[key] = [];
      pastByMonth[key].push(session);
    }

    for (const [key, sessions] of Object.entries(pastByMonth)) {
      const [year, month] = key.split('-').map(Number);
      await ArchiveService.appendToArchive(year, month, sessions, {});
    }

    // Recalculate all counters from restored sessions (source of truth)
    const currentWeekStart = getWeekStartString();
    const currentMonthStart = getMonthString();
    const todayStr = getTodayString();
    const rTodayStart = new Date(); rTodayStart.setHours(0, 0, 0, 0);
    const rTodayEnd = new Date(rTodayStart); rTodayEnd.setDate(rTodayEnd.getDate() + 1);
    const rWeekStartDate = new Date(currentWeekStart + 'T00:00:00');
    const rWeekEndDate = new Date(rWeekStartDate); rWeekEndDate.setDate(rWeekEndDate.getDate() + 7);
    const [rYear, rMonth] = currentMonthStart.split('-').map(Number);

    let rTotal = 0, rToday = 0, rWeek = 0, rMonthTime = 0;
    for (const s of currentMonthSessions) {
      const dur = s.duration || 0;
      const d = new Date(s.startTime);
      rTotal += dur;
      if (d >= rTodayStart && d < rTodayEnd) rToday += dur;
      if (d >= rWeekStartDate && d < rWeekEndDate) rWeek += dur;
      if (d.getFullYear() === rYear && d.getMonth() + 1 === rMonth) rMonthTime += dur;
    }

    const updatedGlobal = {
      ...(ttState.global || {}),
      sessions: currentMonthSessions,
      totalTime: rTotal,
      todayTime: rToday,
      weekTime: rWeek,
      monthTime: rMonthTime,
      lastActiveDate: todayStr,
      weekStart: currentWeekStart,
      monthStart: currentMonthStart
    };

    globalTimesCache = null;
    timeTrackingDataState.set({ ...ttState, global: updatedGlobal });
    saveTimeTracking();

    console.debug(`[TimeTracking] Restored global sessions from backup: ${currentMonthSessions.length} sessions (current month), archived ${Object.keys(pastByMonth).length} past months`);
  } catch (e) {
    console.warn('[TimeTracking] Failed to restore global from backup:', e.message);
  }
}

// rebuildArchivedGlobalSessions removed - cannot accurately reconstruct global sessions
// from project sessions because overlapping sessions would double-count time.
// Past month global sessions are now restored from the pre-migration backup in rebuildGlobalSessionsIfNeeded().

// ============================================================
// SESSION SAVE (to timeTrackingDataState)
// ============================================================

/**
 * Save a global session
 */
async function saveGlobalSession(startTime, endTime, duration) {
  await saveGlobalSessionAt(startTime, endTime, duration, new Date());
}

/**
 * Save a global session using a specific reference date for counter attribution
 * This ensures midnight splits attribute time to the correct day/week/month
 */
async function saveGlobalSessionAt(startTime, endTime, duration, refDate) {
  console.debug('[TimeTracking] saveGlobalSession:', { duration: Math.round(duration / 1000) + 's' });

  const today = getDateString(refDate);
  const weekStart = getWeekStartStringForDate(refDate);
  const monthStart = getMonthStringForDate(refDate);

  const ttState = timeTrackingDataState.get();
  const prev = ttState.global || {
    totalTime: 0, todayTime: 0, weekTime: 0, monthTime: 0,
    lastActiveDate: null, weekStart: null, monthStart: null, sessions: []
  };

  const todayTime = (prev.lastActiveDate !== today ? 0 : (prev.todayTime || 0)) + duration;
  const weekTime = (prev.weekStart !== weekStart ? 0 : (prev.weekTime || 0)) + duration;
  const monthTime = (prev.monthStart !== monthStart ? 0 : (prev.monthTime || 0)) + duration;

  const sessionDate = new Date(startTime);
  const isCurrentMonthSession = sessionDate.getFullYear() === refDate.getFullYear()
    && sessionDate.getMonth() === refDate.getMonth();

  let sessions;
  if (isCurrentMonthSession) {
    sessions = mergeOrAppendSession(prev.sessions || [], startTime, endTime, duration);
  } else {
    const newSession = {
      id: generateSessionId(),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration
    };
    await ArchiveService.appendToArchive(sessionDate.getFullYear(), sessionDate.getMonth(), [newSession], {});
    sessions = prev.sessions || [];
  }

  const globalTracking = {
    ...prev,
    totalTime: (prev.totalTime || 0) + duration,
    todayTime, weekTime, monthTime,
    lastActiveDate: today, weekStart, monthStart,
    sessions
  };

  globalTimesCache = null;
  timeTrackingDataState.set({ ...ttState, global: globalTracking });
  saveTimeTracking();
}

/**
 * Save a session to a project's time tracking data
 */
async function saveSession(projectId, startTime, endTime, duration) {
  await saveSessionAt(projectId, startTime, endTime, duration, new Date());
}

/**
 * Save a project session using a specific reference date for counter attribution
 */
async function saveSessionAt(projectId, startTime, endTime, duration, refDate) {
  console.debug('[TimeTracking] saveSession:', { projectId, duration: Math.round(duration / 1000) + 's' });

  const today = getDateString(refDate);

  const sessionDate = new Date(startTime);
  const isCurrentMonthSession = sessionDate.getFullYear() === refDate.getFullYear()
    && sessionDate.getMonth() === refDate.getMonth();

  const ttState = timeTrackingDataState.get();
  const prev = ttState.projects[projectId] || {
    totalTime: 0, todayTime: 0, lastActiveDate: null, sessions: []
  };

  const tracking = { ...prev };

  if (tracking.lastActiveDate !== today) {
    tracking.todayTime = 0;
  }

  tracking.totalTime = (tracking.totalTime || 0) + duration;
  tracking.todayTime = (tracking.todayTime || 0) + duration;
  tracking.lastActiveDate = today;

  if (isCurrentMonthSession) {
    tracking.sessions = mergeOrAppendSession(tracking.sessions || [], startTime, endTime, duration);
  } else {
    const newSession = {
      id: generateSessionId(),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration
    };
    const project = getProjectById(projectId);
    await ArchiveService.appendToArchive(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      [],
      { [projectId]: { projectName: project?.name || 'Unknown', sessions: [newSession] } }
    );
  }

  timeTrackingDataState.set({
    ...ttState,
    projects: { ...ttState.projects, [projectId]: tracking }
  });
  saveTimeTracking();
}

// ============================================================
// PROJECT TRACKING
// ============================================================

function startTracking(projectId) {
  if (!projectId) return;

  const state = trackingState.get();
  const activeSessions = new Map(state.activeSessions);
  const existingSession = activeSessions.get(projectId);

  if (existingSession && existingSession.sessionStartTime && !existingSession.isIdle) return;

  if (existingSession && existingSession.isIdle) {
    resumeTracking(projectId);
    return;
  }

  const wasEmpty = getActiveNonIdleCount() === 0;
  const now = Date.now();

  activeSessions.set(projectId, {
    sessionStartTime: now,
    lastActivityTime: now,
    isIdle: false
  });

  trackingState.set({ ...trackingState.get(), activeSessions });

  if (wasEmpty) startGlobalTimer();

  clearTimeout(idleTimers.get(projectId));
  idleTimers.set(projectId, setTimeout(() => checkAndPauseTracking(projectId), IDLE_TIMEOUT));
}

async function stopTracking(projectId) {
  const state = trackingState.get();
  const activeSessions = new Map(state.activeSessions);
  const session = activeSessions.get(projectId);

  if (!session || !session.sessionStartTime) {
    activeSessions.delete(projectId);
    trackingState.set({ ...trackingState.get(), activeSessions });
    return;
  }

  const now = Date.now();
  const duration = now - session.sessionStartTime;
  if (duration > 1000) {
    await saveSession(projectId, session.sessionStartTime, now, duration);
  }

  clearTimeout(idleTimers.get(projectId));
  idleTimers.delete(projectId);
  lastOutputTimes.delete(projectId);
  activeSessions.delete(projectId);

  trackingState.set({ ...trackingState.get(), activeSessions });

  if (getActiveNonIdleCount() === 0) await stopGlobalTimer();
}

function recordActivity(projectId) {
  if (!projectId) return;

  const state = trackingState.get();
  const activeSessions = new Map(state.activeSessions);
  const session = activeSessions.get(projectId);

  if (!session) {
    startTracking(projectId);
    return;
  }

  if (session.isIdle) {
    resumeTracking(projectId);
    return;
  }

  clearTimeout(idleTimers.get(projectId));
  idleTimers.set(projectId, setTimeout(() => checkAndPauseTracking(projectId), IDLE_TIMEOUT));
  resetGlobalIdleTimer();

  activeSessions.set(projectId, { ...session, lastActivityTime: Date.now() });
  trackingState.set({ ...trackingState.get(), activeSessions });
}

async function checkAndPauseTracking(projectId) {
  const lastOutput = lastOutputTimes.get(projectId) || 0;
  const timeSinceOutput = Date.now() - lastOutput;

  if (timeSinceOutput < OUTPUT_IDLE_TIMEOUT) {
    const delay = OUTPUT_IDLE_TIMEOUT - timeSinceOutput + 100;
    clearTimeout(idleTimers.get(projectId));
    idleTimers.set(projectId, setTimeout(() => checkAndPauseTracking(projectId), delay));
    return;
  }

  await pauseTracking(projectId);
}

async function checkAndPauseGlobalTimer() {
  const timeSinceOutput = Date.now() - globalLastOutputTime;

  if (timeSinceOutput < OUTPUT_IDLE_TIMEOUT) {
    const delay = OUTPUT_IDLE_TIMEOUT - timeSinceOutput + 100;
    clearTimeout(globalIdleTimer);
    globalIdleTimer = setTimeout(checkAndPauseGlobalTimer, delay);
    return;
  }

  await pauseGlobalTimer();
}

function recordOutputActivity(projectId) {
  if (!projectId) return;

  const state = trackingState.get();
  const session = state.activeSessions.get(projectId);
  if (!session || session.isIdle) return;

  lastOutputTimes.set(projectId, Date.now());
  globalLastOutputTime = Date.now();
}

async function pauseTracking(projectId) {
  const state = trackingState.get();
  const activeSessions = new Map(state.activeSessions);
  const session = activeSessions.get(projectId);

  if (!session || !session.sessionStartTime || session.isIdle) return;

  const now = Date.now();
  const duration = now - session.sessionStartTime;
  if (duration > 1000) {
    await saveSession(projectId, session.sessionStartTime, now, duration);
  }

  activeSessions.set(projectId, { ...session, sessionStartTime: null, isIdle: true });
  trackingState.set({ ...trackingState.get(), activeSessions });

  if (getActiveNonIdleCount() === 0) await pauseGlobalTimer();
}

function resumeTracking(projectId) {
  const state = trackingState.get();
  const activeSessions = new Map(state.activeSessions);
  const session = activeSessions.get(projectId);

  if (!session || !session.isIdle) return;

  const wasAllIdle = getActiveNonIdleCount() === 0;
  const now = Date.now();

  activeSessions.set(projectId, { sessionStartTime: now, lastActivityTime: now, isIdle: false });
  trackingState.set({ ...trackingState.get(), activeSessions });

  if (wasAllIdle) resumeGlobalTimer();

  clearTimeout(idleTimers.get(projectId));
  idleTimers.set(projectId, setTimeout(() => checkAndPauseTracking(projectId), IDLE_TIMEOUT));
}

async function switchProject(oldProjectId, newProjectId) {
  if (oldProjectId && oldProjectId !== newProjectId) {
    await stopTracking(oldProjectId);
  }
  if (newProjectId) startTracking(newProjectId);
}

// ============================================================
// GETTERS
// ============================================================

/**
 * Get time tracking data for a project
 */
function getProjectTimes(projectId) {
  const ttState = timeTrackingDataState.get();
  const tracking = ttState.projects[projectId];

  if (!tracking) return { today: 0, total: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Calculate from sessions as source of truth (not stored counters)
  let todayFromSessions = 0;
  let totalFromSessions = 0;
  if (Array.isArray(tracking.sessions)) {
    for (const session of tracking.sessions) {
      const dur = session.duration || 0;
      totalFromSessions += dur;
      const sessionDate = new Date(session.startTime);
      if (sessionDate >= todayStart && sessionDate < todayEnd) {
        todayFromSessions += dur;
      }
    }
  }

  const state = trackingState.get();
  const session = state.activeSessions.get(projectId);
  let currentSessionTime = 0;
  let currentSessionTimeToday = 0;

  if (session && session.sessionStartTime && !session.isIdle) {
    const now = Date.now();
    currentSessionTime = now - session.sessionStartTime;
    const effectiveStart = Math.max(session.sessionStartTime, todayStart.getTime());
    currentSessionTimeToday = Math.max(0, now - effectiveStart);
  }

  return {
    today: todayFromSessions + currentSessionTimeToday,
    total: totalFromSessions + currentSessionTime
  };
}

/**
 * Get global time tracking stats
 */
function getGlobalTimes() {
  const now = new Date();
  const nowMs = now.getTime();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const weekStartDate = new Date(now);
  weekStartDate.setDate(weekStartDate.getDate() - diffToMonday);
  weekStartDate.setHours(0, 0, 0, 0);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);

  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let todayTotal, weekTotal, monthTotal;

  // Invalidate cache if date changed
  const todayStr = getTodayString();
  if (globalTimesCache && globalTimesCacheDate !== todayStr) {
    globalTimesCache = null;
  }

  if (globalTimesCache) {
    todayTotal = globalTimesCache.sessionsToday;
    weekTotal = globalTimesCache.sessionsWeek;
    monthTotal = globalTimesCache.sessionsMonth;
  } else {
    const ttState = timeTrackingDataState.get();
    const globalTracking = ttState.global;

    // Calculate from sessions
    let sessionsToday = 0, sessionsWeek = 0, sessionsMonth = 0;
    if (globalTracking) {
      const sessions = globalTracking.sessions || [];
      for (const session of sessions) {
        const sessionDate = new Date(session.startTime);
        const duration = session.duration || 0;

        if (sessionDate >= todayStart && sessionDate < todayEnd) sessionsToday += duration;
        if (sessionDate >= weekStartDate && sessionDate < weekEndDate) sessionsWeek += duration;
        if (sessionDate >= monthStartDate && sessionDate < monthEndDate) sessionsMonth += duration;
      }
    }

    // Use session-based calculation as source of truth
    // Stored counters (todayTime/weekTime/monthTime) can drift due to duplicate sessions
    todayTotal = sessionsToday;
    weekTotal = sessionsWeek;
    monthTotal = sessionsMonth;

    globalTimesCache = {
      sessionsToday: todayTotal,
      sessionsWeek: weekTotal,
      sessionsMonth: monthTotal
    };
    globalTimesCacheDate = todayStr;
  }

  const state = trackingState.get();
  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const sessionStart = state.globalSessionStartTime;

    const todayEffectiveStart = Math.max(sessionStart, todayStart.getTime());
    if (nowMs > todayEffectiveStart) todayTotal += nowMs - todayEffectiveStart;

    const weekEffectiveStart = Math.max(sessionStart, weekStartDate.getTime());
    if (nowMs > weekEffectiveStart) weekTotal += nowMs - weekEffectiveStart;

    const monthEffectiveStart = Math.max(sessionStart, monthStartDate.getTime());
    if (nowMs > monthEffectiveStart) monthTotal += nowMs - monthEffectiveStart;
  }

  return { today: todayTotal, week: weekTotal, month: monthTotal };
}

/**
 * Get sessions for a project (used by TimeTrackingDashboard)
 */
function getProjectSessions(projectId) {
  return timeTrackingDataState.get().projects[projectId]?.sessions || [];
}

/**
 * Get global tracking data (used by TimeTrackingDashboard)
 */
function getGlobalTrackingData() {
  return timeTrackingDataState.get().global;
}

async function saveAllActiveSessions() {
  const state = trackingState.get();
  const now = Date.now();

  for (const [projectId, session] of state.activeSessions) {
    if (session.sessionStartTime && !session.isIdle) {
      const duration = now - session.sessionStartTime;
      if (duration > 1000) {
        await saveSession(projectId, session.sessionStartTime, now, duration);
      }
    }
  }

  if (state.globalSessionStartTime && !state.globalIsIdle) {
    const duration = now - state.globalSessionStartTime;
    if (duration > 1000) {
      await saveGlobalSession(state.globalSessionStartTime, now, duration);
    }
  }

  for (const timerId of idleTimers.values()) clearTimeout(timerId);
  idleTimers.clear();
  clearTimeout(globalIdleTimer);
  clearInterval(midnightCheckTimer);
  clearInterval(heartbeatTimer);
  clearInterval(checkpointTimer);

  trackingState.set({
    activeSessions: new Map(),
    globalSessionStartTime: null,
    globalLastActivityTime: null,
    globalIsIdle: false
  });

  saveTimeTrackingImmediate();
  console.debug('[TimeTracking] Forced immediate save on quit');
}

function hasTerminalsForProject(projectId, terminals) {
  for (const [, termData] of terminals) {
    if (termData.project && termData.project.id === projectId) return true;
  }
  return false;
}

function getTrackingState() {
  return trackingState.get();
}

function isTracking(projectId) {
  const state = trackingState.get();
  const session = state.activeSessions.get(projectId);
  return session && session.sessionStartTime && !session.isIdle;
}

function getActiveProjectCount() {
  const state = trackingState.get();
  let count = 0;
  for (const session of state.activeSessions.values()) {
    if (session.sessionStartTime && !session.isIdle) count++;
  }
  return count;
}

module.exports = {
  trackingState,
  initTimeTracking,
  startTracking,
  stopTracking,
  recordActivity,
  recordOutputActivity,
  pauseTracking,
  resumeTracking,
  switchProject,
  getProjectTimes,
  getGlobalTimes,
  getProjectSessions,
  getGlobalTrackingData,
  saveAllActiveSessions,
  hasTerminalsForProject,
  getTrackingState,
  ensureTimeTracking,
  isTracking,
  getActiveProjectCount
};
