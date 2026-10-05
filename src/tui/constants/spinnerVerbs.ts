import { getInitialSettings } from '../utils/settings/settings.js'

export function getSpinnerVerbs(): string[] {
  const settings = getInitialSettings()
  const config = settings.spinnerVerbs
  if (!config) {
    return SPINNER_VERBS
  }
  if (config.mode === 'replace') {
    return config.verbs.length > 0 ? config.verbs : SPINNER_VERBS
  }
  return [...SPINNER_VERBS, ...config.verbs]
}

// Spinner verbs for loading messages

// BR-9（spec §7.4，0.1.32）：四轴重写（算力 45 + 意象 25 + 哲学 20 + 趣味 27
// + 通用 13 ≈ 130，vs fork 186  whimsical 池）——去 Anthropic 品牌串动词
// （原池 C 系梗词）/纯荒诞词/fork 专属梗（Gitifying/Hyperspacing/Quantumizing）；
// 保留 getSpinnerVerbs() settings.spinnerVerbs（mode=replace/extend）用户自定义机制（上方）。
export const SPINNER_VERBS = [
  // ── 算力轴（45）：编译/推理/优化/编排/算子开发语义 ──
  'Compiling', 'Inferring', 'Synthesizing', 'Optimizing', 'Orchestrating',
  'Profiling', 'Vectorizing', 'Parallelizing', 'Quantizing', 'Scheduling',
  'Dispatching', 'Pipelining', 'Tiling', 'Fusing', 'Lowering',
  'Analyzing', 'Computing', 'Crunching', 'Hashing', 'Resolving',
  'Indexing', 'Tracing', 'Instrumenting', 'Diagnosing', 'Verifying',
  'Transpiling', 'Linking', 'Loading', 'Executing', 'Evaluating',
  'Benchmarking', 'Debugging', 'Refactoring', 'Parsing', 'Tokenizing',
  'Embedding', 'Aligning', 'Calibrating', 'Tuning', 'Pruning',
  'Distilling', 'Caching', 'Streaming', 'Decoding', 'Encoding',
  // ── 意象轴（25）：攀升/光锥/聚焦/加速动势（呼应昇腾光锥 mark）──
  'Ascending', 'Climbing', 'Summiting', 'Rising', 'Elevating',
  'Converging', 'Focusing', 'Beaming', 'Illuminating', 'Kindling',
  'Forging', 'Crafting', 'Building', 'Shaping', 'Refining',
  'Exploring', 'Navigating', 'Mapping', 'Charting', 'Pioneering',
  'Awakening', 'Igniting', 'Catalyzing', 'Amplifying', 'Accelerating',
  // ── 哲学轴（20）：Atlas 擎天智者/知识承载语义——深度思辨、追问、洞察 ──
  // 思辨（深度思考的正式感，非幽默自嘲）
  'Reasoning', 'Pondering', 'Deliberating', 'Reflecting', 'Imagining',
  'Cerebrating', 'Cogitating', 'Ruminating', 'Contemplating', 'Considering',
  // 追问（追问本质、洞察真相）
  'Philosophising', 'Pontificating', 'Deciphering', 'Perusing', 'Mulling',
  // 愿景（承载知识、构想未来——Atlas 权威地图集语义）
  'Envisioning', 'Determining', 'Mustering', 'Musing', 'Discerning',
  // ── 趣味轴（27）：从 fork 原 186 池保留有算力/构造/物理意象的幽默动词 ──
  // 算力化学/相变意象（加热、结晶、电离——幽默呼应算力升温）
  'Brewing', 'Cooking', 'Crystallizing', 'Caramelizing', 'Fermenting',
  'Ionizing', 'Photosynthesizing', 'Percolating', 'Simmering', 'Stewing',
  'Levitating', 'Transmuting', 'Metamorphosing', 'Unfurling',
  // 工匠趣味（修补/自举）
  'Tinkering', 'Bootstrapping',
  // 烹饪数据双关（切片/搅拌/腌制——Tiling/Hashing 的趣味版）
  'Julienning', 'Whisking', 'Kneading', 'Marinating',
  // 探索/执行趣味
  'Spelunking', 'Foraging', 'Meandering', 'Skedaddling', 'Swooping',
  'Warping', 'Transfiguring',
  // ── 通用收尾（13）：保多样性、避免高频重复 ──
  'Working', 'Processing', 'Thinking', 'Generating', 'Producing',
  'Assembling', 'Composing', 'Constructing', 'Investigating',
  'Researching', 'Studying', 'Reviewing', 'Planning',
];
