# 🏦 生产模式设置指南 - 使用真实银行卡

本文档将指导您如何安全地切换到生产模式，以便连接真实的银行账户。

## 🔒 安全性说明

### Plaid 的安全保障

**是的，使用 Plaid 连接真实银行卡是安全的！** 以下是原因：

#### 1. **银行级加密**
- ✅ **256-bit SSL/TLS 加密** - 与银行使用的相同加密标准
- ✅ **端到端加密** - 数据在传输过程中始终加密
- ✅ **SOC 2 Type II 认证** - 金融行业最高安全标准

#### 2. **只读访问**
- ✅ **无法发起交易** - Plaid 只能读取您的账户信息，不能转账、支付或修改任何内容
- ✅ **无法访问资金** - 完全无法移动您的资金
- ✅ **只能查看** - 仅能查看余额、交易历史等只读数据

#### 3. **凭证安全**
- ✅ **不存储银行密码** - 您的银行登录凭证永远不会存储在我们的服务器上
- ✅ **OAuth 连接** - 使用安全的 OAuth 流程，类似 Google/Apple 登录
- ✅ **访问令牌** - 只存储加密的访问令牌，不是实际凭证

#### 4. **行业标准**
- ✅ **被 11,000+ 金融机构使用** - 包括 Venmo、Robinhood、Mint、Coinbase 等
- ✅ **被数百万用户信任** - 每天处理数百万次安全连接
- ✅ **符合 PCI DSS** - 符合支付卡行业数据安全标准

#### 5. **您的控制权**
- ✅ **随时断开** - 您可以随时撤销访问权限
- ✅ **选择性连接** - 只连接您选择的账户
- ✅ **数据本地存储** - 您的数据存储在本地 SQLite 数据库中

### 我们的应用安全措施

- ✅ **JWT 认证** - 安全的令牌认证系统
- ✅ **密码加密** - 使用 bcrypt 加密存储密码
- ✅ **环境变量** - 敏感信息存储在 `.env` 文件中，不会提交到代码库
- ✅ **本地数据库** - 数据存储在本地，完全由您控制

## 🚀 切换到生产模式的步骤

### 重要前提条件

在切换到生产模式之前，您需要：

1. **完成 Plaid 账户验证**
   - 登录 Plaid Dashboard: https://dashboard.plaid.com
   - 完成身份验证和账户验证流程
   - 可能需要提供业务信息（如果是商业用途）

2. **获取生产环境凭证**
   - 在 Plaid Dashboard 中，进入 "Team Settings" > "Keys"
   - 获取 **Production Secret Key**（不是 Sandbox Secret）
   - 注意：生产密钥与沙盒密钥不同

3. **了解费用**
   - Plaid 生产环境可能需要付费计划
   - 查看 Plaid 定价: https://plaid.com/pricing
   - 某些功能可能需要特定的订阅计划

### 步骤 1: 更新环境变量

编辑 `server/.env` 文件：

```env
# 将环境从 sandbox 改为 production
PLAID_ENV=production

# 使用生产环境的 Secret Key（不是 Sandbox Secret）
PLAID_CLIENT_ID=your-plaid-client-id  # 这个通常不变
PLAID_SECRET=your-production-secret-key  # ⚠️ 必须是生产环境的密钥

# 其他配置保持不变
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here
```

**⚠️ 重要提示：**
- `PLAID_SECRET` 必须是 **Production Secret Key**，不是 Sandbox Secret
- 确保您的 Plaid 账户已获得生产环境访问权限
- 某些功能可能需要 Plaid 的批准或订阅

### 步骤 2: 使用 Development 模式（推荐先测试）

在完全切换到生产模式之前，建议先使用 **Development 模式**：

```env
PLAID_ENV=development
PLAID_SECRET=your-development-secret-key
```

**Development 模式的优势：**
- ✅ 可以连接真实的银行账户
- ✅ 使用真实银行凭证
- ✅ 但数据是测试数据，不会影响真实账户
- ✅ 适合在完全切换到生产前进行测试

### 步骤 3: 重启服务器

更新环境变量后，需要重启服务器：

```bash
# 停止当前运行的服务器
# 在运行服务器的终端按 Ctrl+C

# 重新启动后端服务器
cd server
npm start

# 重新启动前端服务器（如果需要）
cd ..
npm run dev
```

### 步骤 4: 验证配置

检查服务器启动日志，确认使用的是生产环境：

```
Configuring Plaid with environment: production
Plaid Client ID: Set
Plaid Secret: Set
```

### 步骤 5: 连接真实银行账户

1. **打开应用**: http://localhost:5173
2. **登录您的账户**
3. **点击 "Connect Bank"**
4. **搜索您的银行** - 现在会显示真实的银行列表
5. **输入真实凭证** - 使用您的真实银行登录信息
6. **完成连接** - 按照 Plaid Link 的提示完成连接

## 📋 环境模式对比

| 特性 | Sandbox | Development | Production |
|------|---------|-------------|------------|
| **用途** | 开发和测试 | 真实银行测试 | 生产使用 |
| **银行** | 测试银行 | 真实银行 | 真实银行 |
| **凭证** | 测试凭证 | 真实凭证 | 真实凭证 |
| **数据** | 模拟数据 | 测试数据 | 真实数据 |
| **费用** | 免费 | 可能免费 | 可能需要付费 |
| **限制** | 仅测试功能 | 有限制 | 完整功能 |

## ⚠️ 重要注意事项

### 1. **账户验证**
- 生产环境可能需要额外的账户验证
- 某些银行可能需要额外的授权步骤
- 某些功能可能需要 Plaid 的批准

### 2. **费用考虑**
- 查看 Plaid 定价页面了解费用
- 某些 API 调用可能产生费用
- 建议先使用 Development 模式测试

### 3. **银行支持**
- 不是所有银行都支持 Plaid
- 某些银行可能需要特殊配置
- 某些地区可能不支持

### 4. **数据隐私**
- 您的数据存储在本地 SQLite 数据库中
- 确保定期备份数据库
- 不要将 `.env` 文件或数据库文件分享给他人

### 5. **安全最佳实践**
- ✅ 使用强密码保护您的应用账户
- ✅ 定期更新 JWT_SECRET 和 SESSION_SECRET
- ✅ 不要在生产环境中使用默认密钥
- ✅ 定期检查连接的账户
- ✅ 及时断开不再使用的账户连接

## 🔄 切换回 Sandbox 模式

如果需要切换回测试模式：

```env
PLAID_ENV=sandbox
PLAID_SECRET=your-sandbox-secret-key
```

然后重启服务器。

## 🆘 常见问题

### Q: 生产模式安全吗？
**A:** 是的，Plaid 使用银行级加密和安全标准。您的银行凭证不会被存储，只能读取数据，无法发起交易。

### Q: 需要付费吗？
**A:** 取决于您的使用情况。查看 Plaid 定价页面了解详情。Development 模式通常是免费的。

### Q: 可以随时断开连接吗？
**A:** 是的，您可以随时在应用中或通过 Plaid Dashboard 断开银行连接。

### Q: 我的银行支持 Plaid 吗？
**A:** Plaid 支持 11,000+ 金融机构。在连接时搜索您的银行名称即可查看是否支持。

### Q: 数据存储在哪里？
**A:** 所有数据存储在本地 SQLite 数据库 (`server/database.db`) 中，完全由您控制。

### Q: 如果遇到连接问题怎么办？
**A:** 
- 检查 Plaid Dashboard 中的账户状态
- 确认使用的是正确的环境密钥
- 查看服务器日志中的错误信息
- 某些银行可能需要额外的验证步骤

## 📚 相关资源

- **Plaid Dashboard**: https://dashboard.plaid.com
- **Plaid 文档**: https://plaid.com/docs
- **Plaid 安全**: https://plaid.com/security
- **Plaid 定价**: https://plaid.com/pricing
- **支持银行列表**: 在 Plaid Link 中搜索即可查看

## ✅ 安全检查清单

在切换到生产模式前，请确认：

- [ ] Plaid 账户已完成验证
- [ ] 已获取生产环境 Secret Key
- [ ] 已更新 `server/.env` 文件
- [ ] `PLAID_ENV=production` 已设置
- [ ] 使用的是 Production Secret（不是 Sandbox Secret）
- [ ] JWT_SECRET 和 SESSION_SECRET 已更改为强密码
- [ ] 已重启服务器
- [ ] 已验证服务器日志显示正确的环境
- [ ] 了解 Plaid 的定价和费用
- [ ] 已备份数据库（如果已有数据）

---

**记住：安全第一！** 如果您有任何疑虑，建议先使用 Development 模式进行测试，然后再切换到 Production 模式。


