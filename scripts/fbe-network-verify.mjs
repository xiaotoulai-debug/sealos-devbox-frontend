/**
 * FBE DetailDrawer PUT payload network verification (Playwright).
 * Usage:
 *   FBE_TEST_USER=xxx FBE_TEST_PASS=yyy node scripts/fbe-network-verify.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.FBE_BASE_URL || 'http://localhost:5173';
const USER = process.env.FBE_TEST_USER || '';
const PASS = process.env.FBE_TEST_PASS || '';
const TOKEN = process.env.FBE_TEST_TOKEN || '';
const SHIPMENT_NO = '20260613-1';
const TARGET_EAN = '0785396099875';
const QTY = 1;

const result = {
  restartedNote: 'Dev server should be on 5173 before run',
  baseUrl: BASE,
  loginOk: false,
  loginMessage: '',
  putRequest: null,
  putResponse: null,
  consoleDebugPayload: null,
  pageEanAfterSave: null,
  error: null,
};

function pickPutRequest(req) {
  const url = req.url();
  return req.method() === 'PUT' && /\/api\/fbe-shipments\/\d+/.test(url);
}

async function tryLogin(page) {
  if (TOKEN) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('permissions', 'null');
      localStorage.setItem('user', JSON.stringify({
        id: 1, username: 'network-test', name: 'Network Test',
        role: { id: 1, name: 'admin', isAdmin: true },
      }));
    }, TOKEN);
    result.loginOk = true;
    result.loginMessage = '使用 FBE_TEST_TOKEN 注入登录态';
    return true;
  }
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  if (!USER || !PASS) {
    result.loginMessage = '缺少 FBE_TEST_USER / FBE_TEST_PASS 环境变量';
    return false;
  }
  await page.fill('input[id="username"], input[placeholder*="用户"], input[name="username"]', USER);
  await page.fill('input[id="password"], input[type="password"]', PASS);
  const loginRespPromise = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    { timeout: 15000 },
  );
  await page.click('button[type="submit"]');
  const loginResp = await loginRespPromise.catch(() => null);
  if (!loginResp) {
    result.loginMessage = '未捕获登录响应';
    return false;
  }
  let body = {};
  try {
    body = await loginResp.json();
  } catch {
    /* ignore */
  }
  if (body.code === 200 && body.data?.token) {
    result.loginOk = true;
    result.loginMessage = '登录成功';
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => null);
    return true;
  }
  result.loginMessage = body.message || `登录失败 HTTP ${loginResp.status()}`;
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[FBE] submit payload')) {
      result.consoleDebugPayload = t;
    }
  });

  const putCapture = { req: null, res: null };
  page.on('request', (req) => {
    if (pickPutRequest(req)) {
      putCapture.req = req;
    }
  });
  page.on('response', async (res) => {
    if (pickPutRequest(res.request())) {
      putCapture.res = res;
    }
  });

  try {
    const loggedIn = await tryLogin(page);
    if (!loggedIn) {
      await browser.close();
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }

    await page.goto(`${BASE}/dashboard?tab=fbe-shipments`, { waitUntil: 'networkidle' });

    // Search shipment number
    const searchInput = page.locator('input[placeholder*="发货"], input[placeholder*="单号"], input[placeholder*="搜索"]').first();
    if (await searchInput.count()) {
      await searchInput.fill(SHIPMENT_NO);
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Open detail drawer
    const rowBtn = page.locator('button').filter({ hasText: /明细|查看|详情/ }).first();
    if (await rowBtn.count()) {
      await rowBtn.click();
    } else {
      const row = page.locator('tr').filter({ hasText: SHIPMENT_NO }).first();
      await row.locator('button').first().click();
    }
    await page.waitForTimeout(2500);

    // Append product via Select
    const select = page.locator('.ant-select').filter({ has: page.locator('input') }).first();
    await select.click();
    const selectInput = page.locator('.ant-select-selection-search-input').last();
    await selectInput.fill(TARGET_EAN);
    await page.waitForTimeout(2000);
    const option = page.locator('.ant-select-item-option').filter({ hasText: TARGET_EAN }).first();
    if (await option.count()) {
      await option.click();
    } else {
      // fallback: pick first option
      await page.locator('.ant-select-item-option').first().click();
    }
    await page.waitForTimeout(500);

    // Set quantity to 1 if input visible in new items table
    const qtyInput = page.locator('.ant-input-number-input').last();
    if (await qtyInput.count()) {
      await qtyInput.fill(String(QTY));
    }

    // Save
    const saveBtn = page.locator('button').filter({ hasText: '保存修改' }).first();
    await saveBtn.click();
    await page.waitForTimeout(3000);

    if (putCapture.req) {
      const postData = putCapture.req.postData();
      result.putRequest = {
        url: putCapture.req.url(),
        method: putCapture.req.method(),
        payloadRaw: postData,
        payloadParsed: postData ? JSON.parse(postData) : null,
      };
    }
    if (putCapture.res) {
      let respBody = null;
      try {
        respBody = await putCapture.res.json();
      } catch {
        respBody = await putCapture.res.text().catch(() => null);
      }
      result.putResponse = {
        status: putCapture.res.status(),
        body: respBody,
      };
    }

    // Read displayed EAN in drawer
    const drawer = page.locator('.ant-drawer-body');
    result.pageEanAfterSave = await drawer.innerText().catch(() => null);
  } catch (e) {
    result.error = String(e?.message || e);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
