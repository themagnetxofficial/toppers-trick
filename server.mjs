// Hostinger's "Other" application type starts this root entry file.
// It is intentionally small: the compiled Express server owns all routing.
process.env.NODE_ENV = "production";

await import("./artifacts/api-server/dist/index.mjs");