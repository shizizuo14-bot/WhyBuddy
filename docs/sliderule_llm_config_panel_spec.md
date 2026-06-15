# SlideRule · LLM 配置面板优化 Spec（给新会话执行）

> 目标:优化 `/sliderule` 的「设置 → 语言模型」配置面板(截图里的 OpenAI/Claude/… provider 三栏配置)。
> 覆盖 4 个方面:① 视觉/布局 ② 模型管理 UX ③ 测试连接/校验 ④ 字段/信息架构。
> 红线:**不改 BYOK 数据/接线语义**(provider/model 存取、executor 覆盖、test-connection 真实 ping)。只动展示层与交互,数据层 API 不变。

## 0. 相关文件(动手前先读确认)
- `client/src/pages/sliderule/SettingsDialog.tsx` — 三栏外壳(左 tab:语言模型/系统设置;中 provider 列表;右 detail)。
- `client/src/pages/sliderule/LlmProviderSettings.tsx` — provider 列表 + 右侧 detail(API 密钥/Base URL/模型列表/新建模型 modal/测试连接)。
- `client/src/lib/sliderule-llm-providers.ts` — provider/model 数据层(增删改、持久化、默认模型、能力标签 工具/流式)。
- executor 覆盖:`client/src/lib/sliderule-runtime.ts`(BYOK provider 注入)+ `useSlideRuleSession`(executorMode)。**不要动。**
- 测试连接:`sliderule-llm-providers.ts` 里的 test-connection(真实 ports 到 `${baseURL}/chat/completions`)。

## 1. 视觉/布局
**现状问题**(截图):右栏 detail 信息稀疏、留白大;模型卡片小;`关闭/保存` 在右下但与内容间距松散;启用 toggle 孤悬右上。
**改法**
- 右栏用「分区卡片」收拢:连接(API 密钥 + 需要密钥 + Base URL + 测试连接)/模型(列表 + 新建/重置)两组,各加 section 标题 + 细分隔线,减少大留白。
- provider 列表项:加当前选中高亮条 + 已启用/已配置的状态点(绿=已配 key,灰=未配)。
- 配色/圆角/阴影对齐既有 SettingsDialog 语汇(slate/indigo;参考报告阅读器结构)。
- 暗色:保持当前浅色主题,不引入深色毛玻璃。
- 移动端窄屏:三栏在 <900px 折叠为「列表在上、detail 在下」或抽屉。

## 2. 模型管理 UX
**现状问题**:模型卡片只有 编辑/删除 图标 + 工具/流式 标签;新建走 modal;默认模型不直观;没有"设为默认"。
**改法**
- 模型卡片:加「设为默认」单选(radio)+ 默认徽章;能力标签(工具/流式)可点切换(而非只读)。
- 「新建模型」:modal 内预填该 provider 常见模型名下拉(可自定义输入);校验模型名非空 + 不重复。
- 「重置」:加二次确认(避免误清自定义模型)。
- 列表为空时给空态 + 「从该 provider 拉取模型列表」按钮(若 API 支持 `/models`)。
- 删除:行内确认(非 window.confirm),与其它面板一致。

## 3. 测试连接 / 校验
**现状问题**:测试连接反馈弱;必填项(密钥/Base URL)无即时校验;Base URL 错了只能等真实调用失败。
**改法**
- 「测试连接」按钮:点击 → loading → 成功(绿✓ + 模型/延迟)/失败(红 + 脱敏错误原因:鉴权失败/网络/CORS/404)。复用既有真实 ping,不要 mock。
- 即时校验:`需要 API 密钥` 勾选时密钥空 → 标红提示;Base URL 非 http(s) → 提示;保存时阻塞非法配置。
- 「请求地址」预览(`{baseURL}/chat/completions`)实时跟随 Base URL 更新(现状已有,确认保留)。
- 保存成功 toast;有未保存改动时关闭给确认。

## 4. 字段 / 信息架构
**现状问题**:字段平铺;provider 增删排序不明显;系统设置 tab 与语言模型 tab 关系松。
**改法**
- detail 字段分组(连接 / 模型 / 高级:超时、并发、reasoning effort 等若有)。
- provider 列表:支持拖拽排序或上移/下移;「添加」自定义 provider(已存在,确认 OK)。
- 「系统设置」tab:把推演偏好(driveMode 默认、marathon 预算、viewMode 默认等)收进来,和语言模型并列清晰。
- 文案:每个字段加一句 helper(如 Base URL 何时改、需要密钥何时取消勾选 = 本地服务)。

## 验收
- tsc 0;`verify:sliderule-v5` 不回归(配置面板不在裁决链,主要是组件测试)。
- BYOK 端到端不破:配 key + 选模型 + 测试连接通 → 跑一轮 server-llm/browser-llm 仍生效(executor 覆盖不变)。
- 组件测试(SSR `renderToStaticMarkup` 约定):provider 切换、模型默认/标签切换、校验报错、测试连接三态渲染。
- 应用实测:配置 → 测试连接 → 保存 → 关闭重开持久化在 → 跑推演用上该模型。

## 红线
- 不改 `sliderule-llm-providers.ts` 的存取契约与 executor 注入逻辑(只在其上加 setDefault/校验等纯增量)。
- 测试连接必须真实 ping,不得 mock 成永远成功。
- 文案脱敏,不泄漏内部机制词。
- 每步 tsc 0 + 该步组件测试绿后再提交;按方面分 commit。

---
_基线:当前 main + 未提交的 perf/role-mode WIP(建议先提交存档再开此工)。实现以代码为准,与本 spec 有出入时以代码为准并注明。_
