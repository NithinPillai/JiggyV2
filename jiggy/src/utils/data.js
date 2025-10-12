export const BRAND_PURPLE = '#BFB5F2';

export const DANCES = new Array(14).fill(0).map((_, i) => ({
  id: i + 1,
  title: `Dance #${i + 1}`,
  thumb: '',
  videoUrl: '',
}));

export function generateSegments(totalMs = 11000) {
  const colors = ['red', 'yellow', 'green'];
  const segments = [];
  let elapsed = 0;
  while (elapsed < totalMs) {
    const dur = Math.min(300 + Math.floor(Math.random() * 1200), totalMs - elapsed);
    const color = colors[Math.floor(Math.random() * colors.length)];
    segments.push({ color, dur });
    elapsed += dur;
  }
  return segments;
}
