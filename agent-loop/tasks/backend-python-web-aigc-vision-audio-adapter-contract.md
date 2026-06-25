# 后端 NodeJS 到 Python 迁移：web-aigc vision/audio adapters contract

## 执行状态
- 状态：待执行
- 目标：为 OCR、audio recognition、vision、voice 相关后端 adapter 建立 Python contract。
- 角色分工：worker 负责 contract；reviewer 确认不发真实多模态请求。

### 状态清单
- [x] Python 侧有 vision/audio adapter contract。
- [x] Node 侧测试覆盖 ocr/audio/vision/voice 成功和错误。
- [x] media metadata、mime、duration、confidence 字段稳定。
- [x] gate 全绿。
- [x] Codex review 确认没有真实外部多模态调用。

## 目标

多模态 adapters 是 Node 后端大分母的一部分。此任务只迁契约形状，不迁真实供应商调用。

## 允许修改的文件
- `agent-loop/tasks/backend-python-web-aigc-vision-audio-adapter-contract.md`
- `slide-rule-python/services/web_aigc_media_adapter.py`
- `slide-rule-python/tests/test_web_aigc_vision_audio_adapter_contract.py`
- `server/routes/node-adapters/ocr-recognition-node-adapter.ts`
- `server/routes/node-adapters/audio-recognition-node-adapter.ts`
- `server/core/vision-provider.ts`
- `server/core/voice-provider.ts`
- `server/core/audio-transcription-provider.ts`
- `server/routes/__tests__/web-aigc.vision-audio-python-contract.test.ts`
- `shared/web-aigc-ocr-recognition.ts`
- `shared/web-aigc-audio-recognition.ts`

## 禁止扩大范围
- 不发真实图片、音频或语音请求。
- 不提交媒体文件。
- 不泄漏 prompt 或文件路径。
- 不改真实 provider 选择策略。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `webAigcVisionAudioAdapterContractGates`。

## 成功标准

- Python contract 覆盖 OCR/audio/vision/voice 基本结果形状。
- Node 测试确认 confidence 和 errorCode 字段稳定。
- fake runtime 不产生外部调用。
- gate 全绿。
