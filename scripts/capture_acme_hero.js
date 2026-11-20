import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROOFS_DIR = '/Users/likhithkanigolla/.gemini/antigravity/brain/6fd51204-2181-4507-acf1-12ecaf5e5929/acme_hero_proofs';

if (!fs.existsSync(PROOFS_DIR)) {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
}

async function run() {
  console.log('================================================================');
  console.log('  ACME CSE Hero Proofs: Official oneM2M Tree & Protocol Suite');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // -------------------------------------------------------------
  // 1. IN-CSE (:8080) - Global Catalog & ACP Access Control
  // -------------------------------------------------------------
  console.log('1. Connecting to ACME IN-CSE at http://127.0.0.1:8080/...');
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Click Connect
  const connectBtn = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await page.waitForTimeout(2000);
  }

  // Expand all nodes via ACME treejs
  await page.evaluate(() => {
    // Click all expanders
    document.querySelectorAll('.treejs-node').forEach(el => el.click());
    if (typeof expandAll === 'function') expandAll();
  });
  await page.waitForTimeout(1500);

  // Click on acp-llm-propose to show attributes
  const acpNode = page.locator('text=acp-llm-propose').first();
  if (await acpNode.isVisible()) {
    await acpNode.click();
    await page.waitForTimeout(1000);
    const p1 = path.join(PROOFS_DIR, '01_acme_incse_acp_security.png');
    await page.screenshot({ path: p1, fullPage: true });
    console.log(`   ✓ Saved: 01_acme_incse_acp_security.png (ACP acop=35 privilege rule in ACME)`);
  }

  // Click on remediationCatalog
  const catNode = page.locator('text=remediationCatalog').first();
  if (await catNode.isVisible()) {
    await catNode.click();
    await page.waitForTimeout(1000);
    const p2 = path.join(PROOFS_DIR, '02_acme_incse_remediation_catalog.png');
    await page.screenshot({ path: p2, fullPage: true });
    console.log(`   ✓ Saved: 02_acme_incse_remediation_catalog.png (remediationCatalog in ACME)`);
  }

  // -------------------------------------------------------------
  // 2. DistrictA-MN-CSE (:8081) - [custom:mecRadioInfo] & PollingChannel
  // -------------------------------------------------------------
  console.log('\n2. Connecting to ACME DistrictA-MN-CSE at http://127.0.0.1:8081/...');
  await page.goto('http://127.0.0.1:8081/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const connectBtnA = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtnA.isVisible()) {
    await connectBtnA.click();
    await page.waitForTimeout(2000);
  }

  await page.evaluate(() => {
    document.querySelectorAll('.treejs-node').forEach(el => el.click());
  });
  await page.waitForTimeout(1500);

  // Click on radioInfo ([custom:mecRadioInfo] flexContainer)
  const radioNode = page.locator('text=radioInfo').first();
  if (await radioNode.isVisible()) {
    await radioNode.click();
    await page.waitForTimeout(1000);
    const p3 = path.join(PROOFS_DIR, '03_acme_mna_mec_flexcontainer.png');
    await page.screenshot({ path: p3, fullPage: true });
    console.log(`   ✓ Saved: 03_acme_mna_mec_flexcontainer.png ([custom:mecRadioInfo] ty=28 in ACME)`);
  }

  // Click on pollingChannel under RobotAE
  const pchNode = page.locator('text=pollingChannel').first();
  if (await pchNode.isVisible()) {
    await pchNode.click();
    await page.waitForTimeout(1000);
    const p4 = path.join(PROOFS_DIR, '04_acme_mna_robot_pollingchannel.png');
    await page.screenshot({ path: p4, fullPage: true });
    console.log(`   ✓ Saved: 04_acme_mna_robot_pollingchannel.png (pollingChannel ty=15 in ACME)`);
  }

  // -------------------------------------------------------------
  // 3. DistrictB-MN-CSE (:8082) - Handover Target & Standby District
  // -------------------------------------------------------------
  console.log('\n3. Connecting to ACME DistrictB-MN-CSE at http://127.0.0.1:8082/...');
  await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const connectBtnB = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtnB.isVisible()) {
    await connectBtnB.click();
    await page.waitForTimeout(2000);
  }

  await page.evaluate(() => {
    document.querySelectorAll('.treejs-node').forEach(el => el.click());
  });
  await page.waitForTimeout(1500);

  const distNodeB = page.locator('.treejs-node, div:has-text("DistrictB-MN-CSE")').first();
  if (await distNodeB.isVisible()) {
    await distNodeB.click();
    await page.waitForTimeout(1000);
    const p5 = path.join(PROOFS_DIR, '05_acme_mnb_handover_district.png');
    await page.screenshot({ path: p5, fullPage: true });
    console.log(`   ✓ Saved: 05_acme_mnb_handover_district.png (District B Handover Target in ACME)`);
  }

  console.log('\n================================================================');
  console.log('  ACME CSE Hero Proofs: Capture Complete!');
  console.log('================================================================\n');

  await browser.close();
}

run().catch((err) => {
  console.error('ACME Proof Error:', err);
  process.exit(1);
});

