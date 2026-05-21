# 任务清单：Consumer Email Auth And Account

- [x] 定义 `User`、`CurrentUser`、`UserRole`、`UserStatus`、`AuthSession` 共享类型
- [x] 建立用户持久化 schema，支持邮箱全局唯一、密码 hash、角色、状态、登录时间
- [x] 实现 `POST /api/auth/register`，去除 `tenantCode` 依赖
- [x] 实现 `POST /api/auth/login`，支持邮箱密码登录和统一失败提示
- [x] 实现 `GET /api/auth/me`，返回当前用户安全信息
- [x] 实现 `POST /api/auth/refresh` 或等价 session 延续能力，刷新 DB session 的 lastSeen/expiry，不依赖 JWT refresh token
- [x] 实现 `POST /api/auth/logout`，撤销 DB session、清理 httpOnly cookie，并可选失效 Redis session cache
- [x] 实现 `requireAuth` 中间件，从 httpOnly cookie 恢复 DB-backed session，校验用户 active 后注入 `req.user`
- [x] 实现 `optionalAuth` 中间件，为公开页面保留可选用户上下文
- [x] 新增前端 auth store，支持登录态恢复、登录、注册、登出、`isAdmin` 派生状态和 401/403 统一处理
- [x] 新增登录/注册入口，未登录访问个人项目时跳转登录
- [x] 为旧 localStorage 项目归属迁移预留用户绑定流程
- [x] 补充认证单元测试和接口测试，覆盖注册、登录、me、logout、session 撤销、Redis miss 回查 MySQL、禁用用户和错误响应
- [x] 审核并记录不迁移 web-main 的 tenant、department、position、user-group、dynamic menu 能力
