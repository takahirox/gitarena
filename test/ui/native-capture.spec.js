import { test, expect } from '@playwright/test';
// Chromium's test-only flag accepts the current-tab picker. The stream itself
// is native: no media API replacement or synthetic video is used here.
test.use({ channel: 'chromium', launchOptions: { args: ['--auto-accept-this-tab-capture'] } });
test('native current-tab capture includes the live iframe and stops sharing', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async options => {
      const stream = await original(options); window.capturedTracks = stream.getTracks(); return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose commits' }).click();
  await page.getByRole('textbox', { name: 'Local repository path' }).fill('/fixture/repository');
  await page.getByRole('button', { name: 'Launch comparison' }).click();
  await expect(page.locator('#comparison')).toBeVisible();
  await page.frameLocator('iframe[title="Left live application"]').getByRole('button', { name: '0' }).click();
  await page.locator('[data-side=left]').click();
  await expect(page.getByRole('heading', { name: 'Annotate snapshot' })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.capturedTracks?.every(track => track.readyState === 'ended'))).toBe(true);
  const darkPixels = await page.locator('#snapshot-image').evaluate(async image => {
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80 && pixels[i + 3] > 0) dark++;
    return dark;
  });
  expect(darkPixels).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/snapshot-editor.png' });
});
