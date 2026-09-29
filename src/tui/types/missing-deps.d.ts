// Ambient module declarations.
// Bodyless (shorthand) modules resolve all imports to any.
// Modules whose named/default imports are used AS TYPES get explicit
// bodies declaring those symbols as `any`, avoiding TS2709 (namespace-as-type).
//
// 注（2026-09-29 TUI 壳波 Slice D，复审勿重提）：@opentelemetry/api /
// asciichart / vscode-jsonrpc 已为真依赖（package.json，Slice D 引入）：
// asciichart = 纯 JS 包无自带类型，本 ambient 块仍是其唯一类型源（不可删）；
// 另两包 ambient 块与真类型共存，tsc 0 验真（无冲突）。其余 declare 块对应
// 包 = 真环境遮蔽（未引入新仓；运行时经 try/catch / lazy require /
// darwin 平台门 / env 门 / #atlas-* vendor stub 兜底，Slice D 停机点登记）。

// --- OpenTelemetry ---
declare module '@opentelemetry/api' {
  export type Attributes = any;
  export type HrTime = [number, number];
  export type Span = any;
  export type MetricOptions = any;
  export type Logger = any;
  export type LoggerProvider = any;
  export const LoggerProvider: any = null;
  export type LogRecordExporter = any;
  export type ReadableLogRecord = any;
  export type ResourceMetrics = any;
  export type MetricData = any;
  export type AggregationTemporality = any;
  export type OTelDataPoint<T = any> = any;
  export type PushMetricExporter = any;
}
declare module '@opentelemetry/core' {
  export type ExportResult = any;
  export const ExportResultCode: any;
}
declare module '@opentelemetry/sdk-metrics' {
  export const AggregationTemporality: any;
  export type MetricData = any;
  export type DataPoint<T = any> = any;
  export type PushMetricExporter = any;
  export type ResourceMetrics = any;
}
declare module '@opentelemetry/sdk-logs' {
  export const BatchLogRecordProcessor: any;
  export type LoggerProvider = any;
  export const LoggerProvider: any = null;
  export type ConsoleLogRecordExporter = any;
  export const ConsoleLogRecordExporter: any = null;
  export type LogRecordExporter = any;
  export type ReadableLogRecord = any;
}
declare module '@opentelemetry/sdk-trace-base';
declare module '@opentelemetry/resources';
declare module '@opentelemetry/api-logs' {
  export type AnyValueMap = any;
  export type Logger = any;
  export const logs: any;
}
declare module '@opentelemetry/semantic-conventions';
declare module '@opentelemetry/exporter-metrics-otlp-grpc';
declare module '@opentelemetry/exporter-metrics-otlp-http';
declare module '@opentelemetry/exporter-metrics-otlp-proto';
declare module '@opentelemetry/exporter-prometheus';
declare module '@opentelemetry/exporter-logs-otlp-grpc';
declare module '@opentelemetry/exporter-logs-otlp-http';
declare module '@opentelemetry/exporter-logs-otlp-proto';
declare module '@opentelemetry/exporter-trace-otlp-grpc';
declare module '@opentelemetry/exporter-trace-otlp-http';
declare module '@opentelemetry/exporter-trace-otlp-proto';

// --- Azure (bodyless: value imports only) ---
declare module '@azure/identity';

// --- ANSI / tokenizers ---
declare module '@alcalzone/ansi-tokenize' {
  export type AnsiCode = any;
  export type Token = any;
  export type StyledChar = any;
  export type SyntaxTheme = any;
}
declare module 'code-excerpt' {
  export type CodeExcerpt = any;
}
declare module 'highlight.js';
declare module 'cli-highlight';
declare module 'xss';
declare module 'fflate';
declare module 'cacache';
declare module 'bidi-js';
declare module 'asciichart';
declare module 'type-fest' {
  export type Except<T, U = any> = any;
}
// --- bun-types 1.4.0 process 事件重载收窄修复 ---
// bun-types overrides.d.ts 把 NodeJS.Process 的 on/once/off/addListener/
// removeListener 收窄为仅 "memoryPressure" 重载,标准 Node 事件
// ("exit"/"beforeExit"/"warning"/"SIGCONT"…)全部报错。运行时这些是合法
// Node API——接口合并把通用重载合并回去,调用点零改动。
// 注:本文件是脚本(无顶层 import/export),`declare global` 无效;
// 必须直接用 `declare namespace NodeJS` 合并全局接口。
declare namespace NodeJS {
  interface Process {
    on(event: string | symbol, listener: (...args: any[]) => void): this
    once(event: string | symbol, listener: (...args: any[]) => void): this
    off(event: string | symbol, listener: (...args: any[]) => void): this
    addListener(event: string | symbol, listener: (...args: any[]) => void): this
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this
  }
}

declare module 'process' {
  interface Process {
    on(event: string | symbol, listener: (...args: any[]) => void): this
    once(event: string | symbol, listener: (...args: any[]) => void): this
    off(event: string | symbol, listener: (...args: any[]) => void): this
    addListener(event: string | symbol, listener: (...args: any[]) => void): this
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this
  }
}

declare module 'qrcode';

// --- undici (type-only import; runtime lazy-require, package optional) ---
declare module 'undici' {
  export type Dispatcher = any;
  export type DispatcherOptions = any;
  export class EnvHttpProxyAgent {
    constructor(options?: any);
    [k: string]: any;
  }
  export namespace EnvHttpProxyAgent {
    export type Options = any;
  }
  export const setGlobalDispatcher: (dispatcher: any) => void;
  export const getGlobalDispatcher: () => any;
  export class Agent {
    constructor(options?: any);
    [k: string]: any;
  }
  export class ProxyAgent {
    constructor(uri: string, options?: any);
    [k: string]: any;
  }
}

// --- plist (lazy dynamic import, macOS only path) ---
declare module 'plist' {
  export function parse(input: string): any;
  export function build(input: any): string;
}

// --- ws (default import used as a type) ---
declare module 'ws' {
  const WsWebSocket: any;
  export default WsWebSocket;
}

// --- MCPB / agent-sdk ---
// De-Anthropic (P1.2): the mcpb and sandbox-runtime packages are now pulled
// in through `#atlas-mcpb` / `#atlas-sandbox-runtime` import-map subpaths
// (see package.json "imports" and src/vendor/ shims), so their ambient
// declarations are no longer needed. Only the type-only claude-agent-sdk
// ambient module remains (re-exported by src/vendor/atlas-agent-sdk.ts).
// [ATLAS-HOLD] module 名 @anthropic-ai/claude-agent-sdk 为物理 npm 包名，
// 须与 src/vendor/atlas-agent-sdk.ts 的 re-export 说明符一致；Atlas 以
// 自有 scope 重发包后再统一改名。
declare module '@anthropic-ai/claude-agent-sdk' {
  export type PermissionMode = any;
}

// --- GrowthBook (class used as a type) ---
declare module '@growthbook/growthbook' {
  export class GrowthBook {
    constructor(options?: any) {}
    [k: string]: any;
  }
}

// --- Computer-use MCP ---
declare module '@ant/computer-use-mcp' {
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
  export type CuSubGates = any;
  export type CuCallToolResult = any;
  export type ComputerUseSessionContext = any;
  export type ComputerUseInputAPI = any;
  export type ComputerUseHostAdapter = any;
  export type ScreenshotResult = any;
  export type ScreenshotDims = any;
  export type ComputerUseInput = any;
  export type CoordinateMode = any;
  export type RunningApp = any;
  export type FrontmostApp = any;
  export type InstalledApp = any;
  export type ResolvePrepareCaptureResult = any;
  export type ComputerUseAPI = any;
}
declare module '@ant/computer-use-mcp/types' {
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
  export type ComputerUseInput = any;
}
declare module '@ant/computer-use-mcp/sentinelApps';
declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any;
}
declare module '@ant/computer-use-input' {
  export type ComputerUseInputAPI = any;
  export type ComputerUseInput = any;
}
// --- NAPI / reconciler / google-auth ---
declare module 'image-processor-napi';
declare module 'audio-capture-napi';
declare module 'color-diff-napi' {
  export const ColorDiff: any;
  export const ColorFile: any;
  export const getSyntaxTheme: any;
  export type SyntaxTheme = any;
}
declare module 'url-handler-napi';

declare module 'react-reconciler/constants.js';
declare module 'react-reconciler' {
  export type FiberRoot = any;
}
declare module 'usehooks-ts';
declare module 'google-auth-library' {
  export type GoogleAuth = any;
  export class GoogleAuth {} 
}

// --- LSP ---
declare module 'vscode-languageserver-protocol' {
  export type InitializeParams = any;
  export type InitializeResult = any;
  export type ServerCapabilities = any;
  export type PublishDiagnosticsParams = any;
  export type LocationLink = any;
  export type SymbolInformation = any;
  export type DocumentSymbol = any;
  export type CallHierarchyItem = any;
  export type CallHierarchyIncomingCall = any;
  export type CallHierarchyOutgoingCall = any;
  export type SymbolKind = any;
  export type MarkupContent = any;
  export type MarkedString = any;
  export type Hover = any;
  export type IsEqual<A, B> = any;
  export type AnyValueMap = any;
  export type CountTokensCommandInput = any;
  export type DisplayGeometry = any;
}
declare module 'vscode-languageserver-types' {
  export type Token = any;
  export type SymbolKind = any;
  export type MarkupContent = any;
}
declare module 'vscode-jsonrpc/node.js' {
  export const createMessageConnection: any;
  export type MessageConnection = any;
  export const StreamMessageReader: any;
  export const StreamMessageWriter: any;
  export const Trace: any;
}
// ── P1.1 residual: additional ambient-module exports (merged) ──
declare module '@opentelemetry/api' {
  export const context: any;
  export const diag: any;
  export const trace: any;
  export type DiagLogger = any;
  export type DiagLogLevel = any;
  export const DiagLogLevel: any;
}
declare module '@opentelemetry/sdk-metrics' {
  export class ConsoleMetricExporter { [k: string]: any; }
  export class MeterProvider { [k: string]: any; }
  export class PeriodicExportingMetricReader { [k: string]: any; }
}
declare module '@alcalzone/ansi-tokenize' {
  export const ansiCodesToString: any;
  export const diffAnsiCodes: any;
  export const reduceAnsiCodes: any;
  export const styledCharsFromTokens: any;
  export const tokenize: any;
  export const undoAnsiCodes: any;
}
declare module '@ant/computer-use-mcp' {
  export const API_RESIZE_PARAMS: any;
  export const bindSessionContext: any;
  export const buildComputerUseTools: any;
  export class ComputerExecutor { [k: string]: any; }
  export const createComputerUseMcpServer: any;
  export const DEFAULT_GRANT_FLAGS: any;
  export type DisplayGeometry = any;
  export const targetImageSize: any;
}
declare module '@ant/computer-use-mcp/types' {
  export type ComputerUseHostAdapter = any;
  export type CoordinateMode = any;
  export type CuSubGates = any;
  export const DEFAULT_GRANT_FLAGS: any;
  export type Logger = any;
  export const Logger: any;
}
declare module 'type-fest' {
  export type IsEqual<A, B> = any;
}
declare module 'vscode-languageserver-types' {
  export type CallHierarchyIncomingCall = any;
  export type CallHierarchyItem = any;
  export type CallHierarchyOutgoingCall = any;
  export type DocumentSymbol = any;
  export type Hover = any;
  export type Location = any;
  export type LocationLink = any;
  export type MarkedString = any;
  export type SymbolInformation = any;
}

declare module 'sharp' {
  const sharp: any;
  export default sharp;
}
declare module '*.md' {
  const content: string;
  export default content;
}
declare module '*.py' {
  // Bun text loader (bunfig.toml `".py" = "text"`) inlines .py as raw strings
  // for skill template scripts. The TS codebase never imports .py as a JS module.
  const content: string;
  export default content;
}
