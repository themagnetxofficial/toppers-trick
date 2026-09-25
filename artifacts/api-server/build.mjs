import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  const result = await esbuild({
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/lib/razorpayClient.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outbase: path.resolve(artifactDir, "src"),
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    metafile: true,
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
      // pdfkit and its CJS-only deps (fontkit uses @swc/helpers CJS helpers)
      "pdfkit",
      "fontkit",
      "brotli",
      "linebreak",
      "unicode-properties",
      "unicode-trie",
      "dfa",
      "restructure",
      "tiny-inflate",
      // pdf-parse
      "pdf-parse",
      // multer
      "multer",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  const mainBundle = Object.entries(result.metafile.outputs).find(
    ([file]) => path.resolve(file) === path.join(distDir, "index.mjs"),
  )?.[1];
  for (const dependency of ["razorpay", "axios", "form-data", "combined-stream"]) {
    if (!mainBundle || !Object.keys(mainBundle.inputs).some(
      (file) => file.includes(`/node_modules/${dependency}/`),
    )) {
      throw new Error(`API bundle does not include payment dependency: ${dependency}`);
    }
  }

  // Verify the emitted payment SDK runs without any workspace node_modules.
  // Hostinger does not consistently install nested dependencies of externalized packages.
  const isolatedDir = await mkdtemp(path.join(tmpdir(), "razorpay-build-check-"));
  try {
    const bundlePath = path.join(isolatedDir, "razorpayClient.mjs");
    await copyFile(path.join(distDir, "lib/razorpayClient.mjs"), bundlePath);
    const { createRazorpayClient } = await import(
      `${pathToFileURL(bundlePath).href}?build-check=${Date.now()}`
    );
    const client = createRazorpayClient("build_check_id", "build_check_secret");
    if (typeof client.orders?.create !== "function") {
      throw new Error("Bundled Razorpay client is missing orders.create");
    }
    let requests = 0;
    client.api.rq.defaults.adapter = async (config) => {
      requests += 1;
      const body = JSON.parse(config.data);
      if (config.method !== "post" || !config.url?.endsWith("/orders") ||
          body.amount !== 8900 || body.currency !== "INR") {
        throw new Error("Bundled Razorpay client sent an unexpected order request");
      }
      return {
        data: { id: "order_build_check", amount: body.amount, currency: body.currency },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };
    const order = await client.orders.create({
      amount: 8900,
      currency: "INR",
      receipt: "build_check",
    });
    if (order.id !== "order_build_check" || requests !== 1) {
      throw new Error("Bundled Razorpay client could not create a mock order");
    }
    console.log("Payment SDK bundle check passed without node_modules or network access");
  } finally {
    await rm(isolatedDir, { recursive: true, force: true });
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
