/**
 * Combined Sync Script - NFT Holders + Social Profiles
 *
 * This script runs both syncs in sequence:
 * 1. Sync NFT holders from Legion contracts
 * 2. Sync NEAR Social profiles for all holders
 *
 * Usage:
 *   bun run sync:all:local      # Sync everything to local DB
 *   bun run sync:all:remote     # Sync everything to production DB
 */

const { spawn } = require('child_process');

const SCRIPTS = [
  { name: 'NFT Holders', script: 'sync-simple.ts', flag: 'holders' },
  { name: 'Social Profiles', script: 'sync-profiles.ts', flag: 'profiles' },
];

async function runScript(scriptPath: string, args: string[], name: string): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting: ${name}`);
  console.log(`${'='.repeat(60)}\n`);

  return new Promise((resolve) => {
    const proc = spawn('bun', ['run', scriptPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${name} completed successfully`);
        resolve(true);
      } else {
        console.error(`\n❌ ${name} failed with exit code ${code}`);
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.error(`\n❌ ${name} failed to start:`, err);
      resolve(false);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const remote = args.includes('--remote');

  console.log('='.repeat(60));
  console.log('COMBINED SYNC - NFT HOLDERS + SOCIAL PROFILES');
  console.log('='.repeat(60));
  console.log(`Target: ${remote ? 'Production (Remote)' : 'Local Development'}`);
  console.log(`Scripts to run: ${SCRIPTS.map(s => s.name).join(', ')}`);
  console.log(`Press Ctrl+C to pause (progress saved)\n`);

  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const syncArgs = remote ? ['--remote'] : [];
  const results: { name: string; success: boolean }[] = [];

  for (const script of SCRIPTS) {
    const success = await runScript(script.script, syncArgs, script.name);
    results.push({ name: script.name, success });

    if (!success) {
      console.log(`\n⚠️  ${script.name} failed. Continuing with next script...\n`);
    }

    // Brief pause between scripts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SYNC SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    const status = result.success ? '✅ Success' : '❌ Failed';
    console.log(`${result.name}: ${status}`);
  }

  const allSuccess = results.every(r => r.success);
  const failedCount = results.filter(r => !r.success).length;

  console.log('\n' + '='.repeat(60));
  if (allSuccess) {
    console.log('✅ ALL SYNCs COMPLETED SUCCESSFULLY!');
  } else if (failedCount < results.length) {
    console.log(`⚠️  ${failedCount}/${results.length} syncs failed`);
    console.log('Check the output above for details');
  } else {
    console.log('❌ ALL SYNCs FAILED');
    console.log('Check the output above for error details');
  }
  console.log('='.repeat(60));

  process.exit(allSuccess ? 0 : 1);
}

main().catch(error => {
  console.error('\nFatal:', error);
  process.exit(1);
});
