const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  // Grant clipboard permissions for share button fallback
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();

  await page.goto('http://localhost:8000/index.html');
  await page.waitForSelector('.ep-row');

  await page.click('.ep-row');
  await page.waitForSelector('#detail:not([hidden])');
  console.log("Detail sheet opened");

  // Share logic
  const shareBtn = await page.$('#detailShare');
  await shareBtn.click();
  console.log("Clicked share button");
  await page.waitForSelector('#toast.show');
  console.log("Toast showed");

  await browser.close();
  console.log("All tests passed");
})();
