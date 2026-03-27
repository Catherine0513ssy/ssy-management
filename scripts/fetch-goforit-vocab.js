#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  BOOKS,
  buildSourceMap,
  buildVolumes,
  groupEntries,
  parseGoForItUnitPage,
  summarizeEntries,
} = require('../services/goforit-import');

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    grades: Object.keys(BOOKS),
    output: '',
    timeoutMs: 15000,
    strict: false,
    concurrency: 6,
    retries: 2,
    delayMs: 800,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--grades' && argv[i + 1]) {
      options.grades = argv[i + 1].split(',').map((v) => v.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--output' && argv[i + 1]) {
      options.output = argv[i + 1];
      i += 1;
    } else if (arg === '--timeout' && argv[i + 1]) {
      options.timeoutMs = Number(argv[i + 1]) || options.timeoutMs;
      i += 1;
    } else if (arg === '--concurrency' && argv[i + 1]) {
      options.concurrency = Math.max(1, Number(argv[i + 1]) || options.concurrency);
      i += 1;
    } else if (arg === '--retries' && argv[i + 1]) {
      options.retries = Math.max(0, Number(argv[i + 1]) || options.retries);
      i += 1;
    } else if (arg === '--delay' && argv[i + 1]) {
      options.delayMs = Math.max(0, Number(argv[i + 1]) || options.delayMs);
      i += 1;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/fetch-goforit-vocab.js [options]

Options:
  --grades 7a,7b,8a,8b,9   Limit the fetched books
  --output /path/file.json  Write JSON to file instead of stdout
  --timeout 15000           Per-request timeout in ms
  --concurrency 6           Concurrent page fetches
  --retries 2               Retries per failed page
  --delay 800               Delay between batches in ms
  --strict                  Exit non-zero if any source page fails
`);
}

async function fetchHtml(url, timeoutMs) {
  const timeoutSeconds = String(Math.max(5, Math.ceil(timeoutMs / 1000)));
  const { stdout } = await execFileAsync(
    'curl',
    ['-L', '-s', '--max-time', timeoutSeconds, url],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        LC_ALL: 'C.UTF-8',
      },
    }
  );

  if (!stdout || !stdout.trim()) {
    throw new Error('empty response');
  }

  return stdout;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtmlWithRetry(url, timeoutMs, retries) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchHtml(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(600 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = buildSourceMap(options.grades);

  const entries = [];
  const warnings = [];
  const fetchedSources = [];

  for (let index = 0; index < sources.length; index += options.concurrency) {
    const batch = sources.slice(index, index + options.concurrency);
    const results = await Promise.allSettled(
      batch.map(async (source) => {
        const html = await fetchHtmlWithRetry(source.url, options.timeoutMs, options.retries);
        return {
          source,
          parsed: parseGoForItUnitPage(html, source),
        };
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const source = batch[results.indexOf(result)];
        warnings.push(`Fetch failed: ${source.grade} ${source.unit} ${source.url} :: ${result.reason.message}`);
        continue;
      }

      const { source, parsed } = result.value;
      if (parsed.entries.length === 0) {
        warnings.push(`No entries parsed: ${source.grade} ${source.unit} ${source.url}`);
        continue;
      }

      entries.push(...parsed.entries);
      fetchedSources.push({
        grade: source.grade,
        unit: source.unit,
        url: source.url,
        unit_heading: parsed.unitHeading,
        count: parsed.entries.length,
      });
    }

    if (index + options.concurrency < sources.length && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    publisher: '人民教育出版社',
    textbook: '新目标英语 (Go for it!)',
    source: '给力英语',
    source_site: 'https://www.geilien.cn',
    grades: options.grades,
    fetched_sources: fetchedSources,
    warnings,
    summary: summarizeEntries(entries),
    volumes: buildVolumes(entries),
    grouped: groupEntries(entries),
    entries,
  };

  if (options.strict && warnings.length > 0) {
    console.error(warnings.join('\n'));
    process.exitCode = 1;
  }

  const output = JSON.stringify(payload, null, 2);
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, output);
    console.error(`Wrote ${entries.length} entries to ${outputPath}`);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
