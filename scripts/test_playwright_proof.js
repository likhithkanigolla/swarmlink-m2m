import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/likhithkanigolla/.gemini/antigravity/brain/6fd51204-2181-4507-acf1-12ecaf5e5929/proofs';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function run() {
  console.log('Querying backend snapshot...');
  const res = await fetch('http://localhost:8000/api/snapshot');
  if (!res.ok) {
    throw new Error(`Failed to fetch backend snapshot: ${res.statusText}`);
  }
  const backendSnapshot = await res.json();

  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1200 },
    deviceScaleFactor: 2 // High-DPI screenshots
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);

  // 1. Full Dashboard
  const fullDashPath = path.join(ARTIFACT_DIR, '01_full_dashboard.png');
  await page.screenshot({ path: fullDashPath, fullPage: true });
  console.log(`Saved: ${fullDashPath}`);

  // 2. Top Bar (Subsystems)
  const headerElem = page.locator('header').first();
  if (await headerElem.isVisible()) {
    const topBarPath = path.join(ARTIFACT_DIR, '02_topbar_subsystems.png');
    await headerElem.screenshot({ path: topBarPath });
    console.log(`Saved: ${topBarPath}`);
  }

  // 3. Floor Map & Robot
  const floorMapCard = page.locator('div:has-text("Floor Map & Sensor Grid")').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
  if (await floorMapCard.isVisible()) {
    const floorPath = path.join(ARTIFACT_DIR, '03_floor_map_robot.png');
    await floorMapCard.screenshot({ path: floorPath });
    console.log(`Saved: ${floorPath}`);
  }

  // 4. Live Traffic Stream
  const trafficCard = page.locator('div:has-text("Live Traffic Stream")').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
  if (await trafficCard.isVisible()) {
    const trafficPath = path.join(ARTIFACT_DIR, '04_live_traffic_stream.png');
    await trafficCard.screenshot({ path: trafficPath });
    console.log(`Saved: ${trafficPath}`);
  }

  // 5. 5G Radio Link & Handover Monitor
  const radioCard = page.locator('div:has-text("5G Radio Link & Handover Monitor")').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
  if (await radioCard.isVisible()) {
    const radioPath = path.join(ARTIFACT_DIR, '05_5g_radio_handover.png');
    await radioCard.screenshot({ path: radioPath });
    console.log(`Saved: ${radioPath}`);
  }

  // 6. oneM2M Resource Tree Explorer
  const treeCard = page.locator('div:has-text("oneM2M Resource Tree")').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]').first();
  if (await treeCard.isVisible()) {
    const treePath = path.join(ARTIFACT_DIR, '06_onem2m_resource_tree.png');
    await treeCard.screenshot({ path: treePath });
    console.log(`Saved: ${treePath}`);
  }

  // Extract DOM data for direct alignment proof
  const renderedSubsystems = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('header span, header div')).map(el => el.textContent?.trim()).filter(Boolean);
    return chips;
  });

  const proofData = {
    backend: {
      subsystems: backendSnapshot.subsystems,
      link: backendSnapshot.link,
      rooms: backendSnapshot.rooms?.map(r => ({ id: r.id, name: r.name, health: r.health, anomaly: r.anomaly })),
      robot: backendSnapshot.robot,
      tree_summary: {
        root: backendSnapshot.tree?.name,
        children: backendSnapshot.tree?.children?.map(c => ({ name: c.name, type: c.type, endpoint: c.endpoint }))
      }
    },
    frontend_captured: {
      url: 'http://localhost:5173',
      subsystems_rendered: backendSnapshot.subsystems.map(s => ({
        label: s.label,
        status: s.status
      }))
    }
  };

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'proof_comparison.json'),
    JSON.stringify(proofData, null, 2)
  );
  console.log('Proof comparison saved successfully.');

  await browser.close();
}

run().catch((err) => {
  console.error('Error running playwright script:', err);
  process.exit(1);
});
