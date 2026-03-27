# Session 77 Summary — The Rail Roster

**Date:** March 27, 2026  
**Commits:** 10 pushes, cache v47 → v57 (mca-v52 → mca-v62)  
**GitHub PAT:** Provided and used for direct pushes via Python API script

---

## COMPLETED THIS SESSION

### 1. InventoryId Key Migration (Major Stability Improvement)
All state data keys migrated from row-number-based to inventoryId-based. Eliminates row-shift bugs after deletes.

**Migrated:** personalData, mySetsData, isData, scienceData, constructionData  
**Unchanged:** soldData, forSaleData, wantData, upgradeData (use `itemNum|variation` keys, no row-shift bug)

- Parsers use inventoryId as key with fallback to old format for un-backfilled rows
- findPD/findPDKey rewritten to scan by `.itemNum`/`.variation` values (key-format-agnostic)
- New `findPDKeyByRow()` helper for disambiguation
- All save paths (12+ places in wizard.js) use inventoryId as key
- All delete paths use value-based lookups
- All `k.split('|')` old key format patterns eliminated (5 additional fixes in final push)
- Browse lookups scan by values
- QE table + inline buttons pass inventoryId instead of row number
- `completeQuickEntry` accepts inventoryId, does direct state lookup
- `pickSoldItem`, `pickForSaleItem`, `pickRow` skipIf and rendering all scan by values

### 2. Eliminated Background Reload After Delete
- Replaced `_reloadAfterDelete()` (1.5s background full-data reload) with `_adjustRowsAfterDelete()` (instant in-memory row number adjustment)
- Applied to both single-item and group delete paths

### 3. Wizard Improvements
- **Back button fixed** — properly skips multiple consecutive hidden steps
- **Step counter fixed** — excludes set-mode auto-skipped steps from total
- **Save locks cleared on back** — `_wizSaveLock`/`_qeSaving` reset when navigating back, fixing Full Entry button being blocked
- **Est. Worth persists on back** — saved via `oninput` as user types, pre-filled from `wizard.data._qeEstWorth` on re-render
- **Condition values carry forward** — QE1 slider values copied to regular keys when Full Entry is clicked
- **Duplicate condition sliders removed** — conditionDetails shows compact "7/10" badge when condition already set
- **Compact inline layout** — label left, small buttons right on one row (All Original, Has Box, etc.)
- **Dynamic modal width** — widens to ~600px (2 cols) or ~880px (3 cols ABA) for conditionDetails, taller height
- **Notes consolidated into confirm step** — removed standalone notes step from Want List, For Sale, and Sold flows; inline textarea on confirm screen instead
- **Removed 6 diagnostic console.log statements**

### 4. Master Data Patches
- `_patchMasterData()` function runs before `buildPartnerMap()`
- **6017** type fix: Accessory → Caboose
- **2046W** tender fix in set component lists
- **12 set component audit corrections** from Session 72: book errors (6414-75→85, 6476-125→135, 6438-500→6436-500, 6014-325→335, 6119-110→100), bare numbers (6462→6462-1, 6476→6476-25, 6112→6112-1), COTT X-prefix (1004→X1004, 6004→X6004, 2454→X2454)

---

## CURRENT FILE SIZES

| File | Lines |
|------|-------|
| app.js | ~6,680 |
| wizard.js | ~8,150 |
| browse.js | ~1,035 |

**Cache versions:** `_CACHE_VER = '57'` (data) / `CACHE_NAME = 'mca-v62'` (service worker)

---

## PENDING FIXES (carried forward)

- 773 V1/V2 engine+tender split (needs Companions tab data review)
- Beta tester invites (gate built, code is BETA2026 — outreach needed)
- Landing page deployment (Brad: not ready yet)
- Google Cloud app rename: "Lionel Vault" → "The Rail Roster" (manual Console step)
- COTT URL hunting for remaining 27 unmatched items
- Add missing items to master Items tab

---

## KEY PATTERNS & RULES

- **InventoryId is the state key** for personalData, mySetsData, isData, scienceData, constructionData
- **findPD / findPDKey / findPDKeyByRow** — all scan by values, never by key format
- **_patchMasterData()** — post-load fixes for known data errors
- **_adjustRowsAfterDelete()** — instant in-memory row adjustment, no background reload
- **SHEET_TABS config** — single source of truth for master tab names
- **baseItemNum()** — strips P/D/T/C/-P/-D suffixes
- **_saveComplete flag** — prevents double-saves
- **_doCloseWizard()** — bypasses cancel-guard after successful saves
- **wizardBack() clears save locks** — _wizSaveLock and _qeSaving reset on back navigation
- Cache nuke: `caches.keys().then(k => k.forEach(n => caches.delete(n))); navigator.serviceWorker.getRegistrations().then(r => r.forEach(w => w.unregister())); setTimeout(() => location.reload(), 500);`
- Must bump BOTH `_CACHE_VER` in app.js AND `CACHE_NAME` in sw.js on every deploy
