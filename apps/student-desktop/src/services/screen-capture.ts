import { desktopCapturer, nativeImage, screen, shell, systemPreferences } from 'electron';

export function screenPermission(): string {
  return process.platform === 'darwin'
    ? systemPreferences.getMediaAccessStatus('screen')
    : 'granted';
}
async function screenSources(width: number, height: number) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  if (!sources.length || sources.some((source) => source.thumbnail.isEmpty()))
    throw new Error('capture_failed');
  return sources;
}

export async function probeScreenCapture() {
  // Exercise Electron's capture path without retaining or uploading an image.
  await screenSources(64, 36);
}

export async function openScreenSettings() {
  if (process.platform === 'darwin')
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
}

export function screenCount() {
  return screen.getAllDisplays().length;
}

export async function captureScreens(): Promise<Buffer> {
  if (screenPermission() !== 'granted') throw new Error('permission_denied');
  const sources = await screenSources(1920, 1080);
  // Combine all connected monitors, ordered by display ID, into a single bounded JPEG.
  // NativeImage bitmap round-trip uses the same pixel layout on each target OS.
  const images = sources
    .sort((a, b) => a.display_id.localeCompare(b.display_id))
    .map((source) => source.thumbnail);
  const totalWidth = images.reduce((sum, image) => sum + image.getSize().width, 0);
  const maxHeight = Math.max(...images.map((image) => image.getSize().height));
  const scale = Math.min(1, 2560 / totalWidth, 1440 / maxHeight);
  const resized = images.map((image) =>
    image.resize({
      width: Math.max(1, Math.floor(image.getSize().width * scale)),
      quality: 'good',
    }),
  );
  const width = resized.reduce((sum, image) => sum + image.getSize().width, 0);
  const height = Math.max(...resized.map((image) => image.getSize().height));
  const pixels = Buffer.alloc(width * height * 4, 255);
  let offsetX = 0;
  for (const image of resized) {
    const size = image.getSize(),
      bitmap = image.toBitmap({ scaleFactor: 1 });
    for (let row = 0; row < size.height; row++)
      bitmap.copy(
        pixels,
        (row * width + offsetX) * 4,
        row * size.width * 4,
        (row + 1) * size.width * 4,
      );
    offsetX += size.width;
  }
  const composite = nativeImage.createFromBitmap(pixels, { width, height });
  let jpeg = composite.toJPEG(75);
  if (jpeg.length > 5 * 1024 * 1024) jpeg = composite.resize({ width: 1600 }).toJPEG(70);
  if (jpeg.length > 5 * 1024 * 1024) throw new Error('capture_failed');
  return jpeg;
}
