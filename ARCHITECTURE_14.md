# ARCHITECTURE_14.md — The Rail Roster

**Updated:** Session 77 (March 27, 2026)  
**Live:** therailroster.com  
**Repo:** github.com/bhale79/my-collection-app  
**Cache:** `_CACHE_VER = '60'` / `CACHE_NAME = 'mca-v65'`

---

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~650 | SPA shell, nav, page containers, table wrappers |
| `app.js` | ~6,680 | Core: auth, state, data loading, SHEET_TABS config, _patchMasterData, buildPartnerMap, baseItemNum, _adjustRowsAfterDelete, suggestSets, item detail, For Sale/Sold/Want flows, dashboard, row deletion |
| `wizard.js` | ~8,160 | All wizard flows: collection, set (with My Sets write), want, sold, for sale, ephemera, IS, manual entry, custom tender pairing. findPD/findPDKey/findPDKeyByRow. |
| `browse.js` | ~1,035 | Master list rendering, collection views (card + list), My Sets ownership display, ephemera tabs |
| `drive.js` | 515 | Google Drive vault: folder setup, photo upload, per-copy subfolders, config read/write |
| `sheets.js` | ~200 | Sheets API helpers: sheetsGet, sheetsUpdate, sheetsAppend, sheetsDeleteRow, sheetsBatchGet |
| `prefs.js` | ~790 | Preferences page, health check, admin tools (backfill IDs, backfill all collection IDs, rebuild dashboard) |
| `sheet-builder.js` | ~442 | Sheet creation, formatting, dashboard tab, warningOnly protection |
| `vault.js` | ~350 | Collectors Market opt-in/data sharing (optional) |
| `tutorial.js` | ~180 | First-run tutorial overlay |
| `app.css` | 1,044 | All styles: themes, sticky headers, compact buttons, responsive |
| `sw.js` | 87 | Service worker: cache-first with version-based invalidation |

---

## SHEET_TABS Config (Single Source of Truth)

```javascript
const SHEET_TABS = {
  items:        'Lionel PW - Items',
  science:      'Lionel PW - Science',
  construction: 'Lionel PW - Construction',
  paper:        'Lionel PW - Paper',
  other:        'Lionel PW - Other',
  serviceTools: 'Lionel PW - Service Tools',
  catalogs:     'Lionel PW - Catalogs',
  companions:   'Lionel PW - Companions',
  sets:         'Lionel PW - Sets',
  instrSheets:  'Lionel PW - Instr Sheets',
};
```

All tab names under Excel's 31-char limit. Future Pre-War tabs: "Lionel PreW - X".

---

## State Architecture

```
state = {
  user: { name, email, photo },
  masterSheetId: '1Y9-cg8C1CkIqy0RQ66DfP7fmGrE3IGBpyJbtdfYx8q0',
  personalSheetId: '17KUjAYrgt5JdA2y_QzZR9M0nItoMrAk-LeGW07qhtFo',
  masterData: [],          // parsed master inventory (all tabs)
  personalData: {},        // keyed by inventoryId (fallback: "itemNum|variation|row" for un-backfilled)
  forSaleData: {},         // keyed by "itemNum|variation"
  soldData: {},
  wantData: {},
  upgradeData: {},
  setData: [],             // 470 sets from Sets tab (21 columns A-U)
  mySetsData: {},          // keyed by inventoryId (fallback: "setNum|year|row") — owned sets from personal My Sets tab
  companionData: [],       // engine/tender/B-unit relationships
  partnerMap: {},          // built at startup from companions + sets + master
  isData: {},              // instruction sheets
  scienceData: {},         // science set personal data
  constructionData: {},    // construction set personal data
  catalogRefData: [],
  isRefData: [],
  filters: { owned, unowned, boxed, wantList, type, road, search, quickEntry },
  pageSize: 50,
  userDefinedTabs: [],
}
```

---

## Personal Sheet Tabs

### My Collection (25 columns A–Y)
| Col | Field |
|-----|-------|
| A | Item Number |
| B | Variation |
| C | Condition (1-10) |
| D | All Original |
| E | Item Only Price |
| F | Box Only Price |
| G | Item+Box Complete |
| H | Has Box |
| I | Box Condition (1-10) |
| J | Item Photo Link |
| K | Box Photo Link |
| L | Notes |
| M | Date Purchased |
| N | User Est. Worth |
| O | Matched Tender/Engine |
| P | Set ID |
| Q | Year Made |
| R | Is Error |
| S | Error Description |
| T | Quick Entry |
| U | Inventory ID |
| V | Group ID |
| W | Location |
| X | Era |
| Y | Manufacturer |

### My Sets (14 columns A–N) — NEW Session 76
| Col | Field |
|-----|-------|
| A | Set Number |
| B | Set Name |
| C | Year |
| D | Condition (1-10) |
| E | Est Worth |
| F | Date Purchased |
| G | Group ID |
| H | Set ID |
| I | Has Set Box |
| J | Box Condition |
| K | Photo Link |
| L | Notes |
| M | Quick Entry |
| N | Inventory ID |

### Other Personal Tabs
- **Sold** (9 cols A-I)
- **For Sale** (9 cols A-I)
- **Want List** (5 cols A-E)
- **Upgrade List** (7 cols A-G)
- **Catalogs** (10 cols A-J)
- **Paper Items** (14 cols A-N)
- **Mock-Ups** (17 cols A-Q)
- **Other Lionel** (14 cols A-N)
- **Instruction Sheets** (11 cols A-K)
- **Science Sets** (15 cols A-O)
- **Construction Sets** (15 cols A-O)

---

## PartnerMap System

Built by `buildPartnerMap()` after all data loads, before `buildApp()`.

**Data sources (merged):**
1. Companions tab → engine↔tender, engine↔B-unit, AA pairs
2. Sets tab → steam+tender, diesel powered/dummy/B-unit configs
3. Master data → `poweredDummy` field, B-unit existence (itemNum + 'C')

**Lookup functions:**
- `isTender(num)`, `isLocomotive(num)`, `getMatchingTenders(num)`, `getMatchingLocos(num)`
- `isSetUnit(num)`, `getBUnit(num)`, `getAUnit(num)`, `getSetPartner(num)`
- `isF3AlcoUnit(num)` — returns true for ANY diesel
- `getDieselConfigs(num)` — returns ['AA', 'AB', 'ABA'] etc.

---

## Key Helper Functions

- **`normalizeItemNum(n)`** — strips trailing ".0" from spreadsheet numbers
- **`baseItemNum(n)`** — strips P/D/T/C/-P/-D suffixes for cross-convention matching (Lionel catalog "2343P" vs app "2343-P" vs user input "2343")
- **`_displayItemNum(item)`** — adds -P/-D suffix based on `poweredDummy` field
- **`findPD(itemNum, variation)`** — finds personalData entry by scanning `.itemNum` and `.variation` values (key-format-agnostic); has -P/-D fallback
- **`findPDKey(itemNum, variation)`** — returns the state key (inventoryId) for the matching entry
- **`findPDKeyByRow(itemNum, variation, row)`** — disambiguation when multiple copies share the same item number; finds by row, falls back to findPDKey
- **`_pdIndex`** — O(1) lookup index mapping `itemNum|variation` → state key; auto-rebuilds when personalData size changes; used by findPD/findPDKey
- **`suggestSets(enteredItems)`** — matches entered items against set data using baseItemNum comparison
- **`_patchMasterData()`** — runs before buildPartnerMap(); corrects known data errors at load time (6017 type, 2046W tender, 12 set component fixes)
- **`_adjustRowsAfterDelete(dataObj, deletedRow)`** — decrements `.row` on all records above a deleted row; eliminates need for background reload

---

## Save Guards

- **`_saveComplete`** — set on `wizard.data` after any successful save in `saveWizardItem()`, `quickEntryAdd()`, `_quickEntrySaveSet()`, `saveSet()`; checked at top of both main save functions
- **`_wizSaveLock`** — prevents both QE Save and Full Entry buttons from firing
- **`_qeSaving`** — prevents `saveWizardItem` from firing while QE is in progress
- **`_doCloseWizard()`** — use after successful saves to bypass cancel-guard dialog

---

## Wizard Entry Points

| Entry Point | Tab | Grouping Step? |
|-------------|-----|----------------|
| Sidebar "+ Add" | collection | Yes (always) |
| Browse "Add to Collection" | collection | Yes (if engine/diesel) |
| Set detail "Add to Collection" | set | Set wizard flow (auto-advance after match) |
| Want List "+ Add" | want | No |
| Want List "Complete Set" | want | Set suggestions |
| For Sale "+ Add" | forsale | No |
| Sold "+ Add" | sold | No |

---

## Drive Vault Structure

```
The Rail Roster - My Collection/
  ├── My Collection Photos/
  │   ├── {itemNum}/
  │   │   ├── {inventoryId}/     (per-copy subfolders)
  │   │   └── (legacy photos)
  ├── My Sold Collection Photos/
  ├── rail-roster-config.json
  └── The Rail Roster - Brad's Collection (spreadsheet)
```

---

## Row Deletion

- `removeCollectionItem()` uses `sheetsDeleteRow()` (actual row removal)
- Group deletes: sorted bottom-to-top, `_adjustRowsAfterDelete()` called after each
- Single deletes: `_adjustRowsAfterDelete()` called once after delete
- No more `_reloadAfterDelete()` — row numbers adjusted in-memory instantly
- Want/Sold/ForSale/Upgrade removals use `sheetsUpdate()` (blank cells, no row shift)

---

## Key IDs & Constants

| Item | Value |
|------|-------|
| Master Sheet ID | `1Y9-cg8C1CkIqy0RQ66DfP7fmGrE3IGBpyJbtdfYx8q0` |
| Personal Sheet ID | `17KUjAYrgt5JdA2y_QzZR9M0nItoMrAk-LeGW07qhtFo` |
| Admin email | bhale@ipd-llc.com |
| Beta invite code | BETA2026 |
| EPN campid | 5339145351 |
| Data cache ver | `'60'` |
| SW cache name | `'mca-v65'` |
| Vault folder | "The Rail Roster - My Collection" |
| Config file | "rail-roster-config.json" |

---

## InventoryId Key Migration — COMPLETED (Session 77)

All state data keys migrated from row-number-based to inventoryId-based. Row numbers stored on records for Sheets API calls only, never used as state keys.

**Migrated:** personalData, mySetsData, isData, scienceData, constructionData
**Unchanged:** soldData, forSaleData, wantData, upgradeData (these use `itemNum|variation` keys which don't have the row-shift bug)
