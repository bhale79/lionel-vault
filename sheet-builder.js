// ══════════════════════════════════════════════════════════════════
// sheet-builder.js — Sheet formatting, Dashboard tab, Lock/Unlock
// Depends on: accessToken, state, sheetsUpdate(), normalizeItemNum()
// All functions are non-destructive — never touch data rows (row 3+)
// ══════════════════════════════════════════════════════════════════

// Bump this number to push a visual refresh to all users on next sync
const SHEET_FORMAT_VER = 1;

async function applySheetFormatting(sheetId) {
  if (!sheetId || !accessToken) return;
  try {
    // ── 1. Fetch sheet metadata (tab names, IDs, format version) ──
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    if (meta.error) return;
    const sheets = meta.sheets || [];
    const tabMap = {};
    sheets.forEach(s => { tabMap[s.properties.title] = s.properties.sheetId; });

    // ── 2. Check format version (stored in Dashboard!A50) ──────────
    const verRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Dashboard!A50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const verData = await verRes.json();
    const storedVer = parseInt(((verData.values || [[]])[0] || [])[0] || '0');
    const needsDashboardTab = !tabMap.hasOwnProperty('Dashboard');

    // ── 3. Create Dashboard tab if missing ─────────────────────────
    if (needsDashboardTab) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Dashboard', index: 0, tabColor: { red: 0.118, green: 0.227, blue: 0.373 } } } }] })
      });
      // Re-fetch meta to get new sheet ID
      const meta2Res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const meta2 = await meta2Res.json();
      (meta2.sheets || []).forEach(s => { tabMap[s.properties.title] = s.properties.sheetId; });
    }

    // ── 4. Apply tab colors to all data tabs ───────────────────────
    const TAB_COLORS = {
      'My Collection': { red: 0.118, green: 0.227, blue: 0.373 },
      'Sold':          { red: 0.153, green: 0.682, blue: 0.376 },
      'For Sale':      { red: 0.902, green: 0.494, blue: 0.133 },
      'Want List':     { red: 0.161, green: 0.502, blue: 0.725 },
      'Upgrade List':  { red: 0.545, green: 0.361, blue: 0.965 },
      'Catalogs':      { red: 0.827, green: 0.651, blue: 0.263 },
      'Paper Items':   { red: 0.086, green: 0.627, blue: 0.522 },
      'Mock-Ups':      { red: 0.608, green: 0.349, blue: 0.714 },
      'Other Lionel':  { red: 0.498, green: 0.549, blue: 0.553 },
      'Dashboard':     { red: 0.118, green: 0.227, blue: 0.373 },
    };
    const tabColorRequests = Object.entries(TAB_COLORS)
      .filter(([name]) => tabMap.hasOwnProperty(name))
      .map(([name, color]) => ({
        updateSheetProperties: {
          properties: { sheetId: tabMap[name], tabColor: color },
          fields: 'tabColor'
        }
      }));

    // ── 5. Style header rows on data tabs ──────────────────────────
    const DATA_TABS = ['My Collection','Sold','For Sale','Want List','Upgrade List'];
    const headerStyleRequests = DATA_TABS.filter(t => tabMap.hasOwnProperty(t)).flatMap(tab => {
      const sid = tabMap[tab];
      return [
        // Bold + color header row (row 2, index 1)
        {
          repeatCell: {
            range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.118, green: 0.227, blue: 0.373 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 },
                verticalAlignment: 'MIDDLE',
                horizontalAlignment: 'CENTER',
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)'
          }
        },
        // Freeze rows 1-2
        {
          updateSheetProperties: {
            properties: { sheetId: sid, gridProperties: { frozenRowCount: 2 } },
            fields: 'gridProperties.frozenRowCount'
          }
        },
        // Banded rows starting at row 3
        {
          addBanding: {
            bandedRange: {
              bandedRangeId: sid * 100 + 1,
              range: { sheetId: sid, startRowIndex: 2, endRowIndex: 1000 },
              rowProperties: {
                headerColor:       { red: 0.118, green: 0.227, blue: 0.373 },
                firstBandColor:    { red: 0.957, green: 0.961, blue: 0.976 },
                secondBandColor:   { red: 1,     green: 1,     blue: 1     },
              }
            }
          }
        }
      ];
    });

    // ── 6. Send all formatting requests ───────────────────────────
    const allFormatRequests = [...tabColorRequests, ...headerStyleRequests];
    if (allFormatRequests.length) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: allFormatRequests })
      });
    }

    // ── 7. Write Dashboard content ─────────────────────────────────
    await _writeDashboardContent(sheetId, tabMap['Dashboard']);

    // ── 8. Format Dashboard tab ────────────────────────────────────
    const dashId = tabMap['Dashboard'];
    if (dashId !== undefined) {
      const dashFormatRequests = [
        // Freeze row 1 on dashboard
        { updateSheetProperties: { properties: { sheetId: dashId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        // Banner row 1: dark navy background, large white bold text
        { repeatCell: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.063, green: 0.098, blue: 0.169 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 0.878, blue: 0.376 }, fontSize: 14 },
              horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
        // Section header rows (3, 9) — dark navy
        { repeatCell: { range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3 },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.118, green: 0.227, blue: 0.373 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 },
              horizontalAlignment: 'CENTER' } },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
        // Freeze row + set row 1 height to 40px
        { updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 40 }, fields: 'pixelSize' } },
        // Column A width
        { updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 140 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
            properties: { pixelSize: 140 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
            properties: { pixelSize: 140 }, fields: 'pixelSize' } },
      ];
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: dashFormatRequests })
      });
    }

    // ── 9. Write version stamp ─────────────────────────────────────
    await sheetsUpdate(sheetId, 'Dashboard!A50', [[SHEET_FORMAT_VER]]);
    console.log('[SheetFormat] Applied v' + SHEET_FORMAT_VER);

  } catch(e) {
    console.warn('[SheetFormat] Non-fatal error:', e.message);
    // Never throw — formatting is cosmetic, should never block anything
  }
}

async function _writeDashboardContent(sheetId, dashSheetId) {
  if (!sheetId) return;

  // ── Compute stats ──────────────────────────────────────────────
  const userName = (state.user?.name || 'Collector').split(' ')[0];
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const ownedItems = Object.values(state.personalData).filter(pd => {
    if (!pd.owned) return false;
    const noCondition = !pd.condition || pd.condition === 'N/A';
    const noPrice = !pd.priceItem || pd.priceItem === 'N/A';
    return !(pd.hasBox === 'Yes' && noCondition && noPrice);
  });
  let ephCount = 0;
  Object.values(state.ephemeraData || {}).forEach(b => { ephCount += Object.keys(b).length; });
  const totalItems = ownedItems.length + ephCount;

  let totalValue = 0;
  ownedItems.forEach(pd => { if (pd.userEstWorth) totalValue += parseFloat(pd.userEstWorth) || 0; });
  Object.values(state.ephemeraData || {}).forEach(b => {
    Object.values(b).forEach(it => { if (it.estValue) totalValue += parseFloat(it.estValue) || 0; });
  });

  const condItems = ownedItems.filter(pd => pd.condition && !isNaN(parseFloat(pd.condition)));
  const avgCond = condItems.length > 0
    ? (condItems.reduce((s, pd) => s + parseFloat(pd.condition), 0) / condItems.length).toFixed(1)
    : '—';

  const wantCount    = Object.keys(state.wantData    || {}).length;
  const forSaleCount = Object.keys(state.forSaleData || {}).length;
  const upgradeCount = Object.keys(state.upgradeData || {}).length;
  const soldCount    = Object.keys(state.soldData    || {}).length;

  const engines = state.masterData.filter(m => {
    const t = (m.itemType || '').toLowerCase();
    return (t.includes('steam') || t.includes('diesel') || t.includes('electric') || t.includes('locomotive'))
      && ownedItems.some(pd => normalizeItemNum(pd.itemNum) === normalizeItemNum(m.itemNum));
  }).length;

  // ── Write rows ─────────────────────────────────────────────────
  const rows = [
    // Row 1: Banner
    [`THE BOXCAR FILES  ·  ${userName}'s Collection  ·  Last synced: ${now}`],
    // Row 2: blank spacer
    [''],
    // Row 3: Section header
    ['COLLECTION SUMMARY', '', '', ''],
    // Row 4: Column labels
    ['STAT', 'VALUE', 'STAT', 'VALUE'],
    // Rows 5-10: Stat pairs
    ['Items in Collection', totalItems.toLocaleString(),          'Locomotives',     engines.toLocaleString()],
    ['Est. Collection Value', totalValue > 0 ? '$' + Math.round(totalValue).toLocaleString() : '—', 'Avg Condition', avgCond + ' / 10'],
    ['Want List',  wantCount.toLocaleString(),    'For Sale',   forSaleCount.toLocaleString()],
    ['Upgrade List', upgradeCount.toLocaleString(), 'Items Sold', soldCount.toLocaleString()],
    // Row 9: spacer
    [''],
    // Row 10: footer note
    ['Open The Boxcar Files app to edit your collection. Data here is read-only.'],
  ];

  await sheetsUpdate(sheetId, 'Dashboard!A1:D10', rows);
}
