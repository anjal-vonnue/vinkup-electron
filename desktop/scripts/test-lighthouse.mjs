import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.argv[2];

if (!url) {
  console.error('Usage: node scripts/test-lighthouse.mjs <url>');
  process.exit(1);
}

const chrome = await chromeLauncher.launch({
  chromePath: '/usr/bin/google-chrome',
  chromeFlags: ['--headless', '--no-sandbox'],
});

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'info',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });

  if (!result) {
    throw new Error('Lighthouse did not return a report.');
  }

  const categories = result.lhr.categories;

  console.log('\nLighthouse Results\n');

  for (const [, category] of Object.entries(categories)) {
    console.log(`${category.title}: ${Math.round((category.score ?? 0) * 100)}/100`);
  }

  console.log('\nAudit completed successfully.');
} finally {
  await chrome.kill();
}
