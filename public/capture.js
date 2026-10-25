// Capture the real, interacted iframe using browser-mediated tab sharing. No app
// script injection, cross-origin DOM access, or server-side page recreation.
const handle = crypto.randomUUID();
navigator.mediaDevices?.setCaptureHandleConfig?.({ handle, permittedOrigins: [location.origin] });
export async function capture(frame) {
  if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.setCaptureHandleConfig) {
    throw new Error('Snapshot capture needs desktop Chrome/Edge on the local GitArena URL.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true,
      selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
    });
    const track = stream.getVideoTracks()[0];
    if (track.getSettings().displaySurface !== 'browser' || track.getCaptureHandle?.()?.handle !== handle) {
      throw new Error('Select this GitArena browser tab in the sharing picker, then try again.');
    }
    const video = document.createElement('video');
    video.muted = true; video.srcObject = stream;
    const firstFrame = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The tab did not produce a video frame. Try capture again.')), 5000);
      video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
    });
    await Promise.all([video.play(), firstFrame]);
    const rect = frame.getBoundingClientRect();
    if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) throw new Error('Keep the entire app panel visible before capturing. Resize the window or scroll, then try again.');
    const scaleX = video.videoWidth / innerWidth, scaleY = video.videoHeight / innerHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scaleX); canvas.height = Math.round(rect.height * scaleY);
    canvas.getContext('2d').drawImage(video, rect.left * scaleX, rect.top * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return { screenshot: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally { stream?.getTracks().forEach(track => track.stop()); }
}
