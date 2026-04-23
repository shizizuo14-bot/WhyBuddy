# 任务清单：文件切片节点

- [x] 定义文件切片输入输出
  - 已新增 `shared/web-aigc-file-slicing.ts`，统一 `file_slicing` 的请求、切片结果、向量化输入和检索预览输出结构。
  - 输出包含 `chunks / ingestionPayloads / retrievalPreview`，便于直接接入后续向量化与检索链路。
- [x] 设计切片策略配置
  - 当前支持 `fixed_window / paragraph / line` 三种切片模式。
  - 支持 `maxChars / overlapChars / preserveParagraphs` 等策略参数，并在返回中回显实际生效配置。
- [x] 验证不同文件类型
  - 已支持 `text / markdown / json / log / html` 五类最小文件类型。
  - HTML 会先做轻量正文清洗，JSON 会先格式化后再切片，日志内容支持按行聚合输出。
- [x] 与向量化和检索链路联调
  - 已将切片结果投影为 RAG 兼容的 `ChunkRecord` 风格预览、`IngestionPayload[]` 和 `RetrievalResult[]`。
  - 已补充节点测试与路由测试，覆盖策略配置、文件类型差异和下游兼容输出结构。
