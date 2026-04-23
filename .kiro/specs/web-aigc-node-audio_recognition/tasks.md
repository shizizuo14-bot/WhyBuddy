# 任务清单：语音识别节点

- [x] 定义音频识别输入输出
  - [x] 新增 `shared/web-aigc-audio-recognition.ts`，统一 `audio_recognition` 节点输入、输出、音频源与上下文回写契约
  - [x] 支持内联 base64 音频与远端音频链接两种输入形态，复用语音识别链路的 10 MB 上限
- [x] 对接 voice 路由
  - [x] 新增 `server/routes/audio-recognition.ts` 与 `server/routes/node-adapters/audio-recognition-node-adapter.ts`
  - [x] 复用 `voice-provider` 的 STT 能力，并保持与 `server/routes/voice.ts` 一致的配置检查、音频大小限制和失败语义
- [x] 支持识别结果写回上下文
  - [x] 将 transcript、segments、source 元信息写入 `context.audioRecognition`
  - [x] 同步写入 `context.multimodalContext.voiceTranscript`，供 dialogue、document_search、web_qa 下游直接复用
- [x] 验证长音频与失败场景
  - [x] 覆盖内联音频识别、远端音频链接识别、超 10 MB 长音频拒绝、STT 失败返回 503 的最小测试
