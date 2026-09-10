const SIZE = 1080;
const INK = '#17141c';
const PAPER = '#faf7fc';
const ACCENT = '#a543e8';

const wrap = (context, text, maxWidth) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });

  if (line) lines.push(line);
  return lines;
};

/**
 * Renders a square card of the entry — the most shareable thing the app can
 * produce, and the one place its typography leaves the browser. Drawing waits
 * for the webfont so the card does not fall back to a default serif.
 */
export const drawWordCard = async ({ word, phonetic, definition, source }) => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const context = canvas.getContext('2d');
  if (!context) return null;

  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (error) {
    // the fallback stack is still perfectly readable
  }

  const margin = 96;
  const inner = SIZE - margin * 2;

  context.fillStyle = PAPER;
  context.fillRect(0, 0, SIZE, SIZE);

  context.fillStyle = ACCENT;
  context.fillRect(margin, margin, 84, 6);

  context.fillStyle = INK;
  context.font = '700 108px Lora, Georgia, serif';
  const titleLines = wrap(context, word, inner).slice(0, 2);
  titleLines.forEach((line, index) => {
    context.fillText(line, margin, margin + 190 + index * 120);
  });

  let cursor = margin + 190 + titleLines.length * 120;

  if (phonetic) {
    context.fillStyle = ACCENT;
    context.font = '400 44px Lora, Georgia, serif';
    context.fillText(phonetic, margin, cursor + 20);
    cursor += 80;
  }

  context.fillStyle = INK;
  context.font = '400 46px Lora, Georgia, serif';
  wrap(context, definition, inner)
    .slice(0, 7)
    .forEach((line, index) => {
      context.fillText(line, margin, cursor + 90 + index * 66);
    });

  context.fillStyle = '#6f6878';
  context.font = '400 30px Lora, Georgia, serif';
  context.fillText('Dictionearch', margin, SIZE - margin);
  if (source) {
    context.textAlign = 'right';
    context.fillText(source, SIZE - margin, SIZE - margin);
    context.textAlign = 'left';
  }

  return canvas;
};

export const downloadWordCard = async (details) => {
  const canvas = await drawWordCard(details);
  if (!canvas) return false;

  return new Promise((resolve) => {
    const finish = (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${details.word}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve(true);
      } catch (error) {
        resolve(false);
      }
    };

    if (typeof canvas.toBlob === 'function') canvas.toBlob(finish, 'image/png');
    else finish(null);
  });
};
