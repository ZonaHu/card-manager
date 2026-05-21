# 🚀 Card Manager 完整设置步骤指南

本文档将指导您完成 Card Manager 应用的完整设置，使其能够正常运行。

## 📋 前置要求检查

### 1. 检查 Node.js 版本
```bash
node --version
```
**要求**: Node.js v16 或更高版本
- 如果未安装，请访问: https://nodejs.org/

### 2. 检查 npm
```bash
npm --version
```

## ✅ 第一步：安装依赖

### 前端依赖
```bash
cd /Users/zuomiaohu/Desktop/card-manager
npm install
```

### 后端依赖
```bash
cd server
npm install
cd ..
```

**注意**: 根据项目状态，依赖可能已经安装。如果 `node_modules` 文件夹已存在，可以跳过此步骤。

## 🔑 第二步：配置环境变量

### 检查环境变量文件
您的 `server/.env` 文件已存在。现在需要确保所有必要的环境变量都已正确配置。

### 必需的配置项

编辑 `server/.env` 文件，确保包含以下配置：

```env
# 服务器配置
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here-change-in-production
SESSION_SECRET=your-session-secret-here-change-in-production

# Plaid 配置（必需 - 用于银行连接）
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret-key
PLAID_ENV=sandbox  # sandbox, development, 或 production

# Google OAuth 配置（可选 - 用于 Google 登录）
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-secret
```

## 🏦 第三步：获取 Plaid API 凭证（必需）

Plaid 用于连接银行账户，这是应用的核心功能。

### 步骤：

1. **注册 Plaid 账户**
   - 访问: https://dashboard.plaid.com/signup
   - 创建免费的开发者账户

2. **获取凭证**
   - 登录后，进入 "Team Settings" > "Keys"
   - 复制以下信息：
     - **Client ID**
     - **Sandbox Secret Key** (用于测试)

3. **更新 server/.env**
   ```env
   PLAID_CLIENT_ID=粘贴您的Client ID
   PLAID_SECRET=粘贴您的Sandbox Secret
   PLAID_ENV=sandbox
   ```

### Plaid 测试账户信息

在 Sandbox 模式下，您可以使用以下测试凭证：
- **用户名**: `user_good`
- **密码**: `pass_good`
- **测试银行**: First Platypus Bank, Houndstooth Bank, Tartan Bank

## 🔐 第四步：配置 Google OAuth（可选）

如果您想使用 Google 登录功能，需要配置 Google OAuth。

### 步骤：

1. **访问 Google Cloud Console**
   - 访问: https://console.cloud.google.com
   - 使用您的 Google 账户登录

2. **创建项目**
   - 创建新项目或选择现有项目
   - 记录项目 ID

3. **启用 API**
   - 进入 "APIs & Services" > "Library"
   - 搜索并启用 "Google+ API"

4. **创建 OAuth 2.0 凭证**
   - 进入 "APIs & Services" > "Credentials"
   - 点击 "Create Credentials" > "OAuth 2.0 Client ID"
   - 选择 "Web application"
   - 设置名称（如 "Card Manager"）
   - 添加授权重定向 URI:
     ```
     http://localhost:3001/api/auth/google/callback
     ```
   - 点击 "Create"
   - **复制 Client ID 和 Client Secret**

5. **更新 server/.env**
   ```env
   GOOGLE_CLIENT_ID=粘贴您的Google Client ID
   GOOGLE_CLIENT_SECRET=粘贴您的Google Client Secret
   ```

**注意**: 如果不想使用 Google 登录，可以跳过此步骤。应用支持邮箱/密码注册，无需 Google OAuth。

## 🚀 第五步：启动应用

### 启动后端服务器

在第一个终端窗口中：
```bash
cd /Users/zuomiaohu/Desktop/card-manager/server
npm start
```

您应该看到：
```
Server running on port 3001
Configuring Plaid with environment: sandbox
Plaid Client ID: Set
Plaid Secret: Set
```

### 启动前端开发服务器

在第二个终端窗口中：
```bash
cd /Users/zuomiaohu/Desktop/card-manager
npm run dev
```

您应该看到：
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

## 🌐 第六步：访问应用

1. **打开浏览器**
   - 访问: http://localhost:5173

2. **创建账户**
   - 使用邮箱/密码注册，或
   - 使用 Google 登录（如果已配置）

3. **连接银行账户**
   - 点击 "Connect Bank" 或 "Get Started"
   - 使用 Plaid Sandbox 测试凭证连接测试银行

## ✅ 验证设置

### 检查清单

- [ ] Node.js v16+ 已安装
- [ ] 前端依赖已安装 (`node_modules` 存在)
- [ ] 后端依赖已安装 (`server/node_modules` 存在)
- [ ] `server/.env` 文件已配置
- [ ] Plaid 凭证已添加到 `server/.env`
- [ ] JWT_SECRET 和 SESSION_SECRET 已设置
- [ ] 后端服务器在端口 3001 运行
- [ ] 前端服务器在端口 5173 运行
- [ ] 可以在浏览器中访问应用

## 🐛 常见问题排查

### 1. 后端服务器无法启动

**问题**: 端口 3001 已被占用
```bash
# 检查端口占用
lsof -i :3001

# 或更改端口（在 server/.env 中）
PORT=3002
```

**问题**: 缺少环境变量
- 检查 `server/.env` 文件是否存在
- 确保所有必需的变量都已设置

### 2. Plaid 连接失败

**问题**: "Failed to create link token"
- 验证 `PLAID_CLIENT_ID` 和 `PLAID_SECRET` 是否正确
- 确保 `PLAID_ENV=sandbox` 用于测试
- 检查 Plaid Dashboard 中的凭证状态

### 3. Google OAuth 错误

**问题**: "OAuth client not found" 或 "redirect_uri_mismatch"
- 验证重定向 URI 完全匹配: `http://localhost:3001/api/auth/google/callback`
- 检查 Google Cloud Console 中的凭证配置
- **解决方案**: 如果不想使用 Google 登录，可以使用邮箱/密码注册

### 4. 数据库错误

**问题**: 数据库相关错误
```bash
# 删除现有数据库（会清除所有数据）
rm server/database.db

# 重启服务器（会自动创建新数据库）
cd server && npm start
```

### 5. 依赖安装问题

**问题**: npm install 失败
```bash
# 清除缓存并重新安装
rm -rf node_modules package-lock.json
npm install

# 后端
cd server
rm -rf node_modules package-lock.json
npm install
```

## 📝 开发模式

### 使用自动重启（推荐）

**后端**（需要 nodemon）:
```bash
cd server
npm install -g nodemon  # 如果未安装
npm run dev
```

**前端**（已支持热重载）:
```bash
npm run dev
```

## 🎯 下一步

设置完成后，您可以：

1. **创建账户** - 注册新用户
2. **连接银行** - 使用 Plaid 连接测试银行账户
3. **同步交易** - 导入交易历史
4. **查看分析** - 查看支出分析和分类统计

## 📚 相关文档

- `README.md` - 完整项目文档
- `PLAID_SETUP.md` - Plaid 集成详细指南
- `GOOGLE_OAUTH_SETUP.md` - Google OAuth 设置指南
- `QUICK_START_PLAID.md` - Plaid 快速开始

## 🆘 需要帮助？

如果遇到问题：
1. 检查本文档的"常见问题排查"部分
2. 查看服务器控制台的错误信息
3. 验证所有环境变量是否正确配置
4. 确保所有依赖都已正确安装

---

**祝您使用愉快！** 🎉


