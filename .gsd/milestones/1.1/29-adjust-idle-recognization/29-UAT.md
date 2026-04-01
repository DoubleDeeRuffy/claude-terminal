# Phase 29: Adjust Idle Recognition — UAT

**Date:** 2026-02-28
**Tester:** User
**Result:** PASS

## Test Results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Settings dropdown shows 15s, 30s, 1min, 2min, 3min, 5min, 10min | PASS | |
| 2 | User typing extends time tracking | PASS | |
| 3 | Claude output does NOT extend user time tracking (15s idle timeout, Claude writing >20s) | PASS | Core behavioral change verified |
| 4 | Resume typing starts new session (no merge with previous) | PASS | mergeOrAppend removal confirmed |
| 5 | Project switch stops old / starts new tracking | SKIP | Hard to track visually |
| 6 | Close terminal cleans up tracking | SKIP | |
| 7 | 15s idle timeout takes effect at correct duration | PASS | Seconds-based config working |

## Build Verification

- `npm test`: 1124/1124 passed
- `npm run build:renderer`: success

## Summary

5/5 tested scenarios pass. 2 skipped (hard to observe). The core change — Claude output no longer inflating user time tracking — is confirmed working.
