目标：修复 SlideRule Python 迁移文件中的 mojibake 乱码。

范围：
- 仅修改 `tws-ai-slide-rule-python/` 下的测试、文档、注释和用户可见字符串。
- 不改业务逻辑，除非是为了保持字符串断言和实际输出一致。
- 不要提交，不要 `git add`。

成功标准：
- `agent-loop` 的 mojibake gate 不再报告典型乱码片段。
- Python baseline smoke/contract 测试仍然通过。

建议 gate：
- `node agent-loop/src/check-mojibake.js tws-ai-slide-rule-python`
- `cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_v5_smoke.py tests/test_v5_contract_expansion.py -q --tb=short`
