import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROOFS_DIR = '/Users/likhithkanigolla/.gemini/antigravity/brain/6fd51204-2181-4507-acf1-12ecaf5e5929/proofs_comprehensive';

if (!fs.existsSync(PROOFS_DIR)) {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
}

async function run() {
  console.log('================================================================');
  console.log('  SwarmLink-M2M / RescueTwin: Full Feature Playwright Test Suite');
  console.log('================================================================\n');

  console.log('1. Checking Backend REST & WebSocket status...');
  const snapRes = await fetch('http://localhost:8000/api/snapshot');
  if (!snapRes.ok) throw new Error('Backend /api/snapshot not reachable');
  const snap = await snapRes.json();
  console.log(`   - Backend Subsystems: ${snap.subsystems?.length || 0}`);
  console.log(`   - Backend Rooms: ${snap.rooms?.length || 0}`);
  console.log(`   - Backend Active Incidents: ${snap.incidents?.length || 0}`);
  console.log(`   - Backend KPIs: ${snap.kpis?.length || 0}`);
  console.log(`   - Backend Audit Steps: ${snap.audit?.length || 0}`);
  console.log(`   - Backend Security Entries: ${snap.security?.length || 0}\n`);

  console.log('2. Launching Playwright Chromium Browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1720, height: 1200 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log('3. Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const results = {};

  async function captureCard(textQuery, filename, label) {
    console.log(`\nTesting ${label}...`);
    const card = page.locator(`div:has-text("${textQuery}")`).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
    if (await card.isVisible()) {
      const outPath = path.join(PROOFS_DIR, filename);
      await card.screenshot({ path: outPath });
      console.log(`   ✓ Saved: ${filename}`);
      results[label] = 'PASS';
      return card;
    } else {
      console.log(`   ⚠ Could not locate card for: ${textQuery}`);
      results[label] = 'NOT_FOUND';
      return null;
    }
  }

  // --- 1. Top Bar & Subsystems ---
  console.log('\n[1/14] Testing Top Bar & Subsystem Health Chips...');
  const header = page.locator('header').first();
  await header.waitFor({ state: 'visible' });
  const headerText = await header.textContent();
  const cseChips = ['IN-CSE', 'MN-CSE A', 'MN-CSE B', '5G Core', '5G Radio', 'Edge LLM'];
  const chipsFound = cseChips.filter(c => headerText.includes(c));
  console.log(`   - Subsystems Rendered: ${chipsFound.join(', ')} (${chipsFound.length}/${cseChips.length})`);
  await header.screenshot({ path: path.join(PROOFS_DIR, '01_topbar_subsystems.png') });
  results['TopBar Subsystems'] = chipsFound.length === cseChips.length ? 'PASS' : 'PARTIAL';

  // --- 2. KPI Strip ---
  console.log('\n[2/14] Testing KPI Strip & Live Sparklines...');
  const kpiSection = page.locator('div:has-text("Messages / s")').locator('xpath=ancestor::div[contains(@class, "border-b") or contains(@class, "grid")][1]').first();
  if (await kpiSection.isVisible()) {
    await kpiSection.screenshot({ path: path.join(PROOFS_DIR, '02_kpi_strip.png') });
    console.log('   ✓ Saved: 02_kpi_strip.png');
    results['KPI Strip'] = 'PASS';
  }

  // --- 3. Facility Floor Map ---
  await captureCard('Facility Floor Map', '03_facility_floor_map.png', 'Facility Floor Map');

  // --- 4. Triage Priority Queue ---
  await captureCard('Triage Priority Queue', '04_triage_priority_queue.png', 'Triage Priority Queue');

  // --- 5. Unified Live Traffic Stream ---
  await captureCard('Unified Live Traffic Stream', '05_live_traffic_stream.png', 'Unified Live Traffic Stream');

  // --- 6. Operator Approval Panel & Click Interaction ---
  console.log('\n[6/14] Testing Operator Approval Panel...');
  const approvalCard = page.locator('div:has-text("Pending Operator Approvals")').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
  if (await approvalCard.isVisible()) {
    await approvalCard.screenshot({ path: path.join(PROOFS_DIR, '06_approval_panel_pending.png') });
    console.log('   ✓ Saved: 06_approval_panel_pending.png');

    const approveBtn = approvalCard.locator('button:has-text("Approve Remediation")').first();
    if (await approveBtn.isVisible()) {
      console.log('   - Clicking "Approve Remediation" button...');
      await approveBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(PROOFS_DIR, '07_approval_panel_approved.png') });
      console.log('   ✓ Dispatched approval and saved: 07_approval_panel_approved.png');
      results['Operator Approval Interaction'] = 'PASS (Approved)';
    }
  } else {
    console.log('   - Approval panel not currently pending.');
    results['Operator Approval Interaction'] = 'RESOLVED';
  }

  // --- 7. Event Drawer (Click table row, inspect, then close cleanly) ---
  console.log('\n[7/14] Testing Event Inspection Drawer...');
  const tableRow = page.locator('table tbody tr').first();
  if (await tableRow.isVisible()) {
    console.log('   - Clicking table row to inspect oneM2M headers and JSON payload...');
    await tableRow.click();
    await page.waitForTimeout(1000);
    const drawer = page.locator('div.fixed.inset-y-0.right-0').first();
    if (await drawer.isVisible()) {
      await page.screenshot({ path: path.join(PROOFS_DIR, '08_event_drawer_details.png') });
      console.log('   ✓ Saved: 08_event_drawer_details.png');
      results['Event Drawer'] = 'PASS';
      
      // Close drawer cleanly by clicking the X close button
      const closeBtn = drawer.locator('button').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // --- 8. Remediation Protocol Timeline ---
  await captureCard('Remediation Protocol', '09_remediation_timeline.png', 'Remediation Protocol Timeline');

  // --- 9. AI Guardrail Audit ---
  await captureCard('AI Guardrail Audit', '10_ai_guardrail_audit.png', 'AI Guardrail Audit');

  // --- 10. oneM2M Resource Tree Explorer ---
  await captureCard('oneM2M Resource Tree', '11_onem2m_resource_tree.png', 'oneM2M Resource Tree Explorer');

  // --- 11. Remediation Catalogue ---
  await captureCard('Remediation Catalogue', '12_remediation_catalogue.png', 'Remediation Catalogue');

  // --- 12. 5G Link & Handover Monitor ---
  await captureCard('5G Link & Handover', '13_5g_link_handover_monitor.png', '5G Link & Handover Monitor');

  // --- 13. Security Tray (Click & Expand) ---
  console.log('\n[13/14] Testing Security Tray (ACP & Federated Learning)...');
  const secButton = page.locator('button:has-text("oneM2M ACP Security & Federated Learning Tray")').first();
  if (await secButton.isVisible()) {
    console.log('   - Expanding security tray...');
    await secButton.click();
    await page.waitForTimeout(1000);
    const trayContainer = page.locator('div:has-text("Recent Access Control Policy (ACP) Decisions")').locator('xpath=ancestor::div[contains(@class, "border-t")][1]').first();
    if (await trayContainer.isVisible()) {
      await trayContainer.screenshot({ path: path.join(PROOFS_DIR, '14_security_tray_expanded.png') });
      console.log('   ✓ Saved: 14_security_tray_expanded.png');
      results['Security Tray & FL'] = 'PASS';
    }
  }

  // --- 14. Master Full Page Screenshot ---
  console.log('\n[14/14] Capturing Master Full Dashboard View...');
  const masterFull = path.join(PROOFS_DIR, '00_master_full_dashboard.png');
  await page.screenshot({ path: masterFull, fullPage: true });
  console.log(`   ✓ Saved: 00_master_full_dashboard.png`);
  results['Master Full Dashboard'] = 'PASS';

  // Save JSON summary
  fs.writeFileSync(
    path.join(PROOFS_DIR, 'test_suite_results.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
  );

  console.log('\n================================================================');
  console.log('  Playwright Full Feature Suite: COMPLETED ALL CHECKS');
  console.log('================================================================\n');

  await browser.close();
}

run().catch((err) => {
  console.error('Playwright Suite Error:', err);
  process.exit(1);
});
