// Types for the esbuild prebundle of markdown-it@10.0.0 (shared/markdown-it.js).
// Re-exports the @types/markdown-it namespace-class wholesale so
// `MarkdownIt.StateBlock`-style qualified names keep working for vendored code.
// The prebundle's real default export is the constructor itself.
import MarkdownIt = require("markdown-it");

export = MarkdownIt;
