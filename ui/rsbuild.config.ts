import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { getUISharedDependencies } from "every-plugin/build/rspack";
import pkg from "./package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const buildTarget = process.env.BUILD_TARGET as "client" | "server" | "pages" | undefined;
const isServerBuild = buildTarget === "server";
const isPagesBuild = buildTarget === "pages";

const uiSharedDeps = getUISharedDependencies();

function createClientConfig() {
  const plugins = [
    pluginReact(),
    pluginModuleFederation({
      name: normalizedName,
      filename: "remoteEntry.js",
      dts: false,
      exposes: {
        "./Router": "./src/router.tsx",
        "./Hydrate": "./src/hydrate.tsx",
        "./components": "./src/components/index.ts",
        "./providers": "./src/providers/index.tsx",
        "./hooks": "./src/hooks/index.ts",
        "./types": "./src/types/index.ts",
      },
      shared: uiSharedDeps,
    }),
  ];

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/hydrate.tsx",
      },
    },
    resolve: {
      alias: {
        "@": "./src",
      },
    },
    dev: {
      lazyCompilation: false,
      progressBar: false,
      client: {
        overlay: false,
      },
    },
    server: {
      port: 3000,
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      proxy: {
        "/api/auth": {
          target: "http://localhost:3015",
          changeOrigin: true,
          ws: true,
        },
        "/auth": {
          target: "http://localhost:3015",
          changeOrigin: true,
          ws: true,
        },
        "/api": {
          target: "http://localhost:3013",
          changeOrigin: true,
        },
      },
      publicDir: {
        name: "dist",
        copyOnBuild: false,
      },
    },
    tools: {
      rspack: {
        target: "web",
        output: {
          uniqueName: normalizedName,
        },
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        watchOptions: {
          ignored: ["**/routeTree.gen.ts"],
        },
        plugins: [
          TanStackRouterRspack({
            target: "react",
            autoCodeSplitting: true,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist", css: "static/css", js: "static/js" },
      assetPrefix: "/",
      filename: { js: "[name].js", css: "style.css" },
      copy: [
        {
          from: path.resolve(__dirname, "public"),
          to: "./",
          globOptions: {
            ignore: ["**/index.html"],
          },
        },
      ],
    },
    html: {
      template: "./public/index.html",
    },
  });
}

function createServerConfig() {
  const plugins = [pluginReact()];

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/router.server.tsx",
      },
    },
    resolve: {
      alias: {
        "@": "./src",
        "@tanstack/react-devtools": false,
        "@tanstack/react-router-devtools": false,
      },
    },
    tools: {
      rspack: {
        target: "async-node",
        output: {
          uniqueName: `${normalizedName}_server`,
          publicPath: "/",
          library: { type: "commonjs-module" },
        },
        externals: [/^node:/],
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        watchOptions: {
          ignored: ["**/routeTree.gen.ts"],
        },
        plugins: [
          TanStackRouterRspack({ target: "react", autoCodeSplitting: false }),
          new ModuleFederationPlugin({
            name: normalizedName,
            filename: "remoteEntry.server.js",
            dts: false,
            runtimePlugins: [
              require.resolve("@module-federation/node/runtimePlugin"),
            ],
            library: { type: "commonjs-module" },
            exposes: { "./Router": "./src/router.server.tsx" },
            shared: uiSharedDeps,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist" },
      assetPrefix: "auto",
      cleanDistPath: false,
    },
  });
}

function createPagesConfig() {
  // Simple SPA build for Cloudflare Pages - no Module Federation
  return defineConfig({
    plugins: [pluginReact()],
    source: {
      entry: {
        index: "./src/pages-entry.tsx",
      },
    },
    resolve: {
      alias: {
        "@": "./src",
      },
    },
    tools: {
      rspack: {
        target: "web",
        output: {
          uniqueName: normalizedName,
        },
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        plugins: [
          TanStackRouterRspack({
            target: "react",
            autoCodeSplitting: true,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist", css: "static/css", js: "static/js" },
      assetPrefix: "/",
      filename: { js: "[name].[contenthash:8].js", css: "[name].[contenthash:8].css" },
      copy: [
        {
          from: path.resolve(__dirname, "public"),
          to: "./",
          globOptions: {
            ignore: ["**/index.html"],
          },
        },
      ],
    },
    html: {
      template: "./public/index.html",
    },
  });
}

export default isPagesBuild
  ? createPagesConfig()
  : isServerBuild
    ? createServerConfig()
    : createClientConfig();
