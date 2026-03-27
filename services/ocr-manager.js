const { getSetting } = require('./db');
const tencentOCR = require('./ocr-tencent');
const aiOCR = require('./ocr-ai');

// ---------------------------------------------------------------------------
// OCR Engine Manager — selects the active adapter based on settings
// ---------------------------------------------------------------------------

const ENGINES = {
  tencent: tencentOCR,
  ai: aiOCR,
};

/**
 * Recognize text from a base64-encoded image using the configured engine.
 * @param {string} base64Image - Base64-encoded image data (no data URI prefix)
 * @returns {Promise<string[]|object[]>} Recognition result from the active engine
 */
async function recognize(base64Image) {
  const engine = getSetting('ocr_engine') || 'disabled';

  if (engine === 'disabled') {
    throw new Error('OCR is disabled. Please configure an engine in settings.');
  }

  const adapter = ENGINES[engine];
  if (!adapter) {
    throw new Error(`Unknown OCR engine: ${engine}`);
  }

  return adapter.recognize(base64Image);
}

/**
 * Test connectivity for a specific OCR engine using a tiny white 1x1 PNG.
 * @param {string} engine - Engine name ('tencent' or 'ai')
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function testConnection(engine) {
  const adapter = ENGINES[engine];
  if (!adapter) {
    return { ok: false, message: `Unknown engine: ${engine}` };
  }

  // Minimal 1x1 white PNG as a lightweight probe
  const TINY_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
    'Nl7BcQAAAABJRU5ErkJggg==';

  try {
    await adapter.recognize(TINY_PNG);
    return { ok: true, message: 'Connection successful' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = { recognize, testConnection };
