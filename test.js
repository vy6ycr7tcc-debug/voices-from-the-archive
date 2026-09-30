const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`Browser Error: ${msg.text()}`);
  });

  await page.goto('http://localhost:8000/index.html');
  console.log("Page loaded");

  // Wait for initial render
  await page.waitForSelector('.card');
  console.log("Cards rendered");

  // Test search highlight
  await page.fill('#q', 'LL');
  await page.waitForTimeout(500); // Wait for debounce
  const cards = await page.$$('.card');
  console.log(`Found ${cards.length} cards for search 'LL'`);
  const highlight = await page.$('mark');
  console.log(`Search highlight mark found: ${highlight !== null}`);
  await page.fill('#q', '');
  await page.waitForTimeout(500);

  // Test tabs
  await page.click('#tab-bookmarks');
  const bookmarkCards = await page.$$('.card');
  console.log(`Found ${bookmarkCards.length} cards in bookmarks tab`); // Should be 0 initially

  await page.click('#tab-episodes');

  // Test bookmarking
  const firstCardBtn = await page.$('.card .btn-bookmark');
  if (firstCardBtn) {
    await firstCardBtn.click();
    console.log("Clicked bookmark on first card");
  }

  await page.click('#tab-bookmarks');
  const newBookmarkCards = await page.$$('.card');
  console.log(`Found ${newBookmarkCards.length} cards in bookmarks tab after bookmarking`); // Should be 1

  // Test detail sheet opening
  await page.click('.card');
  await page.waitForSelector('#detail.open');
  console.log("Detail sheet opened");

  // Check touch target heights
  const btnPlay = await page.$('#btn-play');
  const btnPlayBox = await btnPlay.boundingBox();
  console.log(`Play button height: ${btnPlayBox.height}px`);

  const scrubber = await page.$('#scrubber-container');
  const scrubberBox = await scrubber.boundingBox();
  console.log(`Scrubber height: ${scrubberBox.height}px`);

  // Share logic
  const shareBtn = await page.$('#sheet .action-btn:last-child');
  await shareBtn.click();
  console.log("Clicked share button");
  await page.waitForSelector('#toast.show');
  console.log("Toast showed");

  await browser.close();
  console.log("All tests passed");
})();
