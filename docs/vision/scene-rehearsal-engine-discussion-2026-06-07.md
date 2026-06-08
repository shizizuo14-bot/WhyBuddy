# 场景化推演引擎方向讨论纪要（2026-06-07）

## 起因

审查了 Agentshire 项目后，发现其 3D 表现力（骨骼动画、日夜天气、编排式 NPC 表演、气泡对话）和链路流畅度（Choreographer → Orchestrator → cinematic sequence）明显优于 WhyBuddy 当前的 3D 层。由此引发了对 WhyBuddy 3D 层升级方向以及更深层产品定位的讨论。

---

## 一、Agentshire 审查结论

### 技术亮点
- 纯 Three.js 命令式游戏引擎（非 R3F），自写 Engine/World/Input/PostProcessing 全套
- 角色/模型资产体系完整：内置角色 + 24 pet + Characters_1 library 变体/颜色组合 + custom GLB；`public/assets/models` 下约 147 个 GLTF/GLB（含建筑/道具/角色）
- 8 槽位骨骼动画（idle / walk / typing / wave / cheer / reading / frustrated / dancing）+ SkeletonUtils clone
- 10 帧日夜 preset + smoothstep 插值 + 12 种天气 + 队列式中间态过渡
- Web Audio API 全程序化环境音合成 + 4 轨 BGM 交叉渐变
- Choreographer 编排层：召唤 → 集结 → 分配 → 进办公室 → 工作 → 庆祝 → 返回
- 约 65 个 GameEvent 严格类型协议，Bridge/Choreographer/Handler 三层分离
- HTML overlay 气泡对话 + 打字机流式效果

### 不具备的
- 无物理碰撞引擎/NavMesh；但不是纯直线移动，已有基于 route-config 的 A* 节点图寻路、move ack/timeout、目的地占用评分，以及召唤队形的障碍规避
- 无 WhyBuddy 这类审计 ledger / 信任 / 血缘 / 可信回放等企业级基础设施；ActivityStream replay 更偏 UI 活动回放，不是可信审计链
- 无真实执行能力（Docker/sandbox）
- 代码约 47K TS/TSX 行；测试不是零（约 17 个 test 文件、260+ describe/it），但相对复杂 3D runtime、editor、NPC 行为和 workflow 编排仍偏薄，缺少强 E2E / 视觉回归

### 对比结论
- 3D 和链路流畅度：Agentshire 完胜（它是"游戏世界"，WhyBuddy 是"仪表盘装饰"）
- 产品深度和执行能力：WhyBuddy 完胜（Docker executor、审计链、信任模型、spec-first 流程；行数/spec 数进入正式 spec 前需重新统计）
- 两者定位不同：Agentshire 让 Agent 好看，WhyBuddy 让 Agent 可信、可控、可审计

---

## 二、从 Agentshire 提取的设计模式（适合 WhyBuddy 引入）

### 2.1 CinematicScheduler + SceneDirector（编排式叙事）

**现状**：Mission 事件 → Socket → Zustand → PetWorkers 换 glow/anim

**目标**：
```
Mission 事件 → Socket → CinematicScheduler (新增)
    ↓ 解析为表演脚本
SceneDirector (新增) → useFrame 内逐帧执行
    - camera animateTo（cubic ease 聚焦到事件发生地）
    - Agent 移动到指定位置
    - lighting mood shift（情绪照明）
    - VFX burst (confetti/shockwave)
    - 气泡对话（打字机效果）
    - 延时后恢复
```

### 2.2 Agent 头顶气泡对话

- 用 `@react-three/drei` 的 `<Html>` 组件锚定到 3D 空间
- 数据源：mission_event / workflow stage / HITL takeover / executor 回调 / trust gate 发现
- 打字机流式效果 + 气泡队列管理（到期自动消失，按序显示）
- 接入点：在 PetWorkers.tsx 每个 agent 的 `<group>` 下加 `<AgentBubble>`

### 2.3 情绪照明（MoodLighting）

- 任务进行中 → 暖光渐变
- 接管点/异常 → 短暂阴天 + 雾气
- 完成 → 黄金时刻 + bloom 增强
- 用 3-5 个 OKLCH color preset + lerp 函数即可

### 2.4 相机叙事

- 关键事件时相机自动 `animateTo` 聚焦对应 Agent
- 用 cubic ease（`4t³` 前半 / `1 - pow(-2t+2, 3)/2` 后半）

### 不搬的
- 纯 Three.js 命令式引擎（跟 R3F 架构冲突）
- NPC 自主行为/Soul Mode（Agent 应反映真实状态不是模拟假行为）
- UGC 地图编辑器（方向不同）
- 全合成音频（非核心价值）

---

## 三、产品方向讨论：场景化推演引擎

### 3.1 核心定位

**"推演万物"——简洁通用的产品推演引擎**

本质：任何问题/好奇/任务都是一次"推演"。系统找到合适的 Agent 团队，执行推演过程，产出可追溯的结果，以提问者能理解的形式呈现。

### 3.2 场景（Scene as a Space）

- 用户主动创建场景（像创建房间），不依赖注册时适配
- 每个场景有独立的：视觉主题 + 角色配置 + 交互规则 + 能力范围
- 一个用户可以有多个场景（为不同目的/人群）
- 场景之间可以跨场景对话/委派

示例：
```
用户
 ├── 场景 A: "恐龙星球" (给 7 岁孩子)
 │     ├── 角色: 恐龙老师、探险家小猫
 │     ├── 主题: 卡通丛林、大字体、语音引导
 │     └── 能力: 故事创作、简单编程启蒙
 │
 ├── 场景 B: "开发者工作室" (自己用)
 │     ├── 角色: 架构师、代码审查员、DevOps
 │     ├── 主题: 冷灰办公室、驾驶舱
 │     └── 能力: 任务执行、Docker、审计链
 │
 └── 场景 C: "产品实验室" (团队共享)
       ├── 角色: PM、设计师、数据分析
       └── 能力: 需求分析、设计评审、数据看板
```

### 3.3 跨场景推演（穿梭机制）

核心循环：
```
任何问题 → 当前场景角色接收 → 判断需要更专业的
    → 路由到合适场景 → 目标场景 Agent 组队执行推演
    → 翻译层：专业结果 → 提问者能理解的形式
    → 回到原始场景呈现
```

具体例子：
- 10 岁小朋友问"天文望远镜到底是啥"
- 恐龙老师判断需要工程师协助 → 穿梭到工程师场景
- 工程师 Agent 组队研究（光学、机械、历史）→ 产出专业答案 + 证据
- 翻译层：转化为 10 岁能懂的语言 + 配图/动画
- 回到恐龙星球，恐龙老师用它的语气讲给孩子听

### 3.4 与现有底盘的对齐

| 已有能力 | 在推演引擎中的角色 |
|----------|-------------------|
| Mission Runtime | = 一次推演的执行载体 |
| FSD 角色/Route | = 组队和路线规划 |
| Takeover | = 推演过程中的人类接管/确认点 |
| Evidence / Audit | = 推演过程的可追溯证据（家长可看） |
| A2A 协议 | = 跨场景的 Agent 通信 |
| Clarification | = 提问者的追问/澄清 |
| Destination parser | = 把自然语言问题解析为推演任务 |

### 3.5 AI 驱动的场景/角色创建

**Phase 1（组合式，短期可做）**：
- 用户输入描述 → LLM 从预制资产库选择模型+配色+角色人格 → 组装场景
- 预制 3-5 个模板（科技实验室/魔法森林/办公室/教室/工作室）
- 角色：LLM 选外观 + 生成 personality + 分配动画风格

**Phase 2（接入 text-to-3D API）**：
- 库中没有的资产 → 调 Meshy/Tripo3D 生成 GLB → 缓存
- 难点：质量控制、骨骼 retarget

**Phase 3（远期完全生成式）**：
- 程序化布局 + 生成式填充（目前无端到端方案）

---

## 四、优势与风险评估

### 优势
1. "推演万物"比"任务自动驾驶"更容易向普通人解释
2. 跨场景委派利用了已有的 A2A/Swarm/Guest Agent 基础设施
3. 审计链在这里有新意义（家长看到推演过程 = 信任透明）
4. 底盘是壁垒——别人做不了真正的"穿梭"，只能做"同一个 LLM 换语气"

### 风险
1. "全年龄全职业"容易稀释资源——建议先选一个群体做透再扩
2. 推演比直接回答慢——价值主张是"过程可见、结果可信、深度更好"而不是"更快"
3. 冷启动问题——需要预制可立即体验的模板场景
4. 3D 不是壁垒——场景系统可被模仿，底盘（真实执行+信任治理）不可

---

## 五、建议的执行顺序

1. **先把当前开发者场景做到 Agentshire 水平的流畅度**
   - CinematicScheduler + SceneDirector（3 个新模块）
   - Agent 气泡对话
   - 情绪照明 + 相机叙事
   - 验证"3D 叙事"这条路 work

2. **加入场景系统基础层**
   - SceneSpace 数据模型 + CRUD
   - ThemeConfig 驱动 3D 渲染（模型包 + 配色 + 光照）
   - 2-3 个预制模板场景

3. **验证跨场景推演闭环**
   - 一个最小案例：儿童场景 → 专家场景 → 翻译回传
   - 用已有的 A2A + Mission Runtime 承接

4. **逐步丰富**
   - AI 场景创建（LLM 组合式）
   - 更多主题资产包
   - 跨场景的信任/证据展示

---

## 六、数据模型草案

```typescript
interface SceneSpace {
  id: string
  name: string                 // "恐龙星球"
  description: string          // 用户输入的创建描述
  theme: ThemeConfig
  agents: AgentConfig[]
  interactionRules: {
    vocabularyLevel: 'child' | 'teen' | 'adult' | 'professional'
    guidanceIntensity: 'high' | 'medium' | 'low'
    toneOfVoice: string
  }
  capabilities: string[]       // 允许的能力范围
  projectId?: string           // 关联 Project-first
}

interface ThemeConfig {
  scenePreset: string          // "jungle" | "space" | "office" | ...
  modelPack: string
  colorTokens: Record<string, string>
  lightingPreset: string
  skybox?: string
}

interface AgentConfig {
  id: string
  name: string
  characterKey: string         // 3D 模型标识
  personality: string          // soul markdown
  role: string
  toneOfVoice: string
  allowCrossScene: boolean     // 可被其他场景 @ 调用
}
```

---

*本文档记录 2026-06-07 讨论内容，作为后续 spec 规划的输入。*
