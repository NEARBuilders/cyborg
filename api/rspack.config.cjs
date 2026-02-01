// Simple rspack config for API development
// API is now deployed via Cloudflare Workers (worker/ package)
// This config is kept for local development only

const { EveryPluginDevServer } = require("every-plugin/build/rspack");

const baseConfig = {
  externals: [
    /^@libsql\/.*/,
    /^bun:sqlite/,
  ],
  plugins: [new EveryPluginDevServer()],
  infrastructureLogging: {
    level: 'error',
  },
  stats: 'errors-warnings',
};

module.exports = baseConfig;
