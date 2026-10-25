import { test, expect } from '@playwright/test';
async function launch(page, ref = 'HEAD~1') {
  await page.getByRole('button', { name: 'Choose commits' }).click();
  await page.getByRole('textbox', { name: 'Local repository path' }).fill('/fixture/repository');
  await page.getByRole('textbox', { name: 'Left commit ref' }).fill(ref);
  await page.getByRole('button', { name: 'Launch comparison' }).click();
}
// Only the browser's permission picker and video source are replaced. The actual
// capture/cropping code, editor, HTTP API and durable store run in the test.
async function syntheticTab(page, wrongTab = false) {
  await page.addInitScript(({ wrongTab }) => {
    let handle;
    navigator.mediaDevices.setCaptureHandleConfig = config => { handle = config.handle; };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = innerWidth; canvas.height = innerHeight;
      const context = canvas.getContext('2d'); context.fillStyle = '#edf5f0'; context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(30), track = stream.getVideoTracks()[0];
      track.getSettings = () => ({ displaySurface: 'browser' });
      track.getCaptureHandle = () => ({ handle: wrongTab ? 'other-tab' : handle });
      return stream;
    };
  }, { wrongTab });
}

test('independent apps, swapping, pen/region/arrow, undo, save/reopen after stopping and reload, switching refs', async ({ page }) => {
  await syntheticTab(page); await page.goto('/');
  await expect(page.locator('#tools')).not.toBeVisible();
  await launch(page);
  await expect(page.locator('#comparison')).toBeVisible();
  const left = page.frameLocator('iframe[title="Left live application"]'), right = page.frameLocator('iframe[title="Right live application"]');
  await expect(left.getByRole('heading')).toHaveText('First version');
  await expect(right.getByRole('heading')).toHaveText('Second version');
  await left.getByRole('button', { name: '0' }).click();
  await expect(left.getByRole('button')).toHaveText('1'); await expect(right.getByRole('button')).toHaveText('0');
  await page.getByRole('button', { name: 'Swap sides' }).click();
  expect(await page.locator('#right-pane').evaluate(element => element.getBoundingClientRect().x)).toBeLessThan(await page.locator('#left-pane').evaluate(element => element.getBoundingClientRect().x));
  await page.locator('[data-side=left]').click();
  await expect(page.getByRole('heading', { name: 'Annotate snapshot' })).toBeVisible();
  await expect(page.locator('#source')).toContainText('a'.repeat(40));
  const box = await page.locator('#drawing').boundingBox();
  for (const name of ['Pen', 'Circle / region', 'Arrow']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 8 }); await page.mouse.up();
  }
  await expect(page.locator('#drawing > *')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#drawing > *')).toHaveCount(2);
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.up();
  await page.locator('#comment').fill('Make this counter more visible.');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved feedback' })).toBeVisible();
  await expect(page.locator('#tools')).not.toBeVisible();
  await expect(page.locator('#drawing > *')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close snapshot' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Comparison stopped');
  await page.reload();
  await page.getByRole('button', { name: /^Feedback/ }).click();
  await page.getByRole('button', { name: /Make this counter/ }).click();
  await expect(page.locator('#comment')).toHaveValue('Make this counter more visible.');
  await expect(page.locator('#source')).toContainText('a'.repeat(40));
  await expect.poll(() => page.locator('#snapshot-image').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#drawing > *')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close snapshot' }).click();
  await launch(page, 'HEAD~2'); await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.locator('#left-pane .ref')).toHaveText('HEAD~2');
  await launch(page, 'HEAD~3'); await expect(page.locator('#left-pane .ref')).toHaveText('HEAD~3');
});

test('startup errors are actionable; the user can stop startup and reject a different capture tab', async ({ page }) => {
  await syntheticTab(page, true); await page.goto('/');
  await launch(page, 'missing');
  await expect(page.getByRole('alert')).toContainText('Invalid commit');
  await launch(page);
  await expect(page.locator('#comparison')).toBeVisible();
  await page.locator('[data-side=left]').click();
  await expect(page.getByRole('alert')).toContainText('Select this GitArena browser tab');
  await expect(page.locator('#editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Comparison stopped');
});
