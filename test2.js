const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  // Grant clipboard permissions for share button fallback
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();

  await page.goto('http://localhost:8000/index.html');
  await page.waitForSelector('.card');

  await page.click('.card');
  await page.waitForSelector('#detail.open');
  console.log("Detail sheet opened");

  // Share logic
  const shareBtn = await page.$('#sheet .action-btn:last-child');
  await shareBtn.click();
  console.log("Clicked share button");
  await page.waitForSelector('#toast.show');
  console.log("Toast showed");

  await browser.close();
  console.log("All tests passed");
})();
