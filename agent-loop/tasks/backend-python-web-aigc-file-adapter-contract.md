# 后端 NodeJS 到 Python 迁移：web-aigc file adapters contract

## 执行状态
- 状态：待执行
- 目标：为 file generation、file slicing、file translation、excel read、long text extraction 建立 Python contract。
- 角色分工：worker 负责契约和 fake runtime；reviewer 确认不读写真实用户文件。

### 状态清单
- [x] Python 侧有 file adapter contract。
- [x] Node 侧测试覆盖 generated/sliced/translated/read/extracted。
- [x] 文件路径安全和 artifact id 字段稳定。
- [x] gate 全绿。
- [x] Codex review 确认没有真实文件副作用。

## 目标

文件类 adapters 是 Node 后端的实用工具大块。此任务只迁 contract，不执行真实文件处理。

## 允许修改的文件
- `agent-loop/tasks/backend-python-web-aigc-file-adapter-contract.md`
- `slide-rule-python/services/web_aigc_file_adapter.py`
- `slide-rule-python/tests/test_web_aigc_file_adapter_contract.py`
- `server/routes/node-adapters/file-generation-node-adapter.ts`
- `server/routes/node-adapters/file-slicing-node-adapter.ts`
- `server/routes/node-adapters/file-translation-node-adapter.ts`
- `server/routes/node-adapters/excel-read-node-adapter.ts`
- `server/routes/node-adapters/long-text-extraction-node-adapter.ts`
- `server/routes/__tests__/web-aigc.file-python-contract.test.ts`
- `shared/web-aigc-file-generation.ts`
- `shared/web-aigc-file-slicing.ts`
- `shared/web-aigc-file-translation.ts`
- `shared/web-aigc-excel-read.ts`
- `shared/web-aigc-long-text-extraction.ts`

## 禁止扩大范围
- 不读真实用户文件。
- 不写真实 artifact。
- 不调用真实 OCR/LLM/translation 服务。
- 不放宽路径校验。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `webAigcFileAdapterContractGates`。

## 成功标准

- Python contract 能表达 file/artifact/error/permission 四类结果。
- Node 测试确认 path traversal（路径穿越）不被接受。
- fake runtime 不产生真实副作用。
- gate 全绿。
