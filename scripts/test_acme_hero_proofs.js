import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ACME_PROOFS_DIR = '/Users/likhithkanigolla/.gemini/antigravity/brain/6fd51204-2181-4507-acf1-12ecaf5e5929/acme_hero_proofs';

if (!fs.existsSync(ACME_PROOFS_DIR)) {
  fs.mkdirSync(ACME_PROOFS_DIR, { recursive: true });
}

async function run() {
  console.log('--- Launching Playwright to capture ACME CSE Web UI and oneM2M operations ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // 1. Capture IN-CSE Web UI (:8080)
  console.log('1. Connecting to ACME IN-CSE Web UI at http://127.0.0.1:8080/...');
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  // Click Connect button
  const connectBtn = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtn.isVisible()) {
    console.log('   Clicking Connect to populate oneM2M resource tree...');
    await connectBtn.click();
    await page.waitForTimeout(2000);
  }

  // Click root node to show attributes in inspector
  const rootNode = page.locator('.treejs-node, div:has-text("cse-in")').first();
  if (await rootNode.isVisible()) {
    await rootNode.click();
    await page.waitForTimeout(1000);
  }

  const inCsePath = path.join(ACME_PROOFS_DIR, '01_acme_in_cse_webui.png');
  await page.screenshot({ path: inCsePath, fullPage: true });
  console.log(`   ✓ Saved ACME IN-CSE Web UI proof: ${inCsePath}`);

  // 2. Capture DistrictA-MN-CSE Web UI (:8081)
  console.log('2. Connecting to ACME DistrictA-MN-CSE Web UI at http://127.0.0.1:8081/...');
  await page.goto('http://127.0.0.1:8081/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  const connectBtnA = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtnA.isVisible()) {
    await connectBtnA.click();
    await page.waitForTimeout(2000);
  }

  const rootNodeA = page.locator('.treejs-node, div:has-text("DistrictA-MN-CSE")').first();
  if (await rootNodeA.isVisible()) {
    await rootNodeA.click();
    await page.waitForTimeout(1000);
  }

  const distAPath = path.join(ACME_PROOFS_DIR, '02_acme_district_a_webui.png');
  await page.screenshot({ path: distAPath, fullPage: true });
  console.log(`   ✓ Saved ACME District A Web UI proof: ${distAPath}`);

  // 3. Capture DistrictB-MN-CSE Web UI (:8082)
  console.log('3. Connecting to ACME DistrictB-MN-CSE Web UI at http://127.0.0.1:8082/...');
  await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  const connectBtnB = page.locator('#connectButton, a:has-text("Connect")').first();
  if (await connectBtnB.isVisible()) {
    await connectBtnB.click();
    await page.waitForTimeout(2000);
  }

  const distBPath = path.join(ACME_PROOFS_DIR, '03_acme_district_b_webui.png');
  await page.screenshot({ path: distBPath, fullPage: true });
  console.log(`   ✓ Saved ACME District B Web UI proof: ${distBPath}`);

  await browser.close();
  console.log('--- ACME Web UI Proofs Complete ---');
}

run().catch((err) => {
  console.error('ACME Proof Error:', err);
  process.exit(1);
});

