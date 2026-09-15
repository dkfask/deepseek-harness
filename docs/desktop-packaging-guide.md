# Windows 桌面应用打包指南

## 概述

本文档记录了将 DeepSeek Harness 项目打包为 Windows 桌面应用的完整流程。

## 环境要求

- **操作系统**: Windows 10/11
- **Node.js**: v18+ 或 v20+
- **包管理器**: pnpm v8+
- **构建工具**: 
  - Visual Studio Build Tools (用于编译 native 模块)
  - Windows SDK

## 打包命令

### 方式一：使用项目脚本（推荐）

```bash
# 开发模式（热重载）
pnpm dev:desktop

# 生产打包
pnpm package:desktop
```

### 方式二：直接使用构建脚本

```bash
# 进入 desktop 目录
cd apps/desktop

# 设置应用ID（可选，用于自定义品牌）
export DSH_DESKTOP_APP_ID="com.yourcompany.yourapp"

# 执行打包
node scripts/package.mjs
```

## 打包流程

打包过程包含以下步骤：

1. **环境检查**: 验证 Node.js、pnpm 版本
2. **依赖安装**: 安装项目依赖和 native 模块
3. **代码构建**: 编译 TypeScript 和前端资源
4. **Runtime 准备**: 打包 Node.js 运行时和 pnpm
5. **Electron 打包**: 使用 electron-builder 创建安装包
6. **代码签名**: 使用 signtool.exe 签名可执行文件（如果配置了证书）
7. **NSIS 安装包**: 生成最终的 .exe 安装程序

## 输出文件

打包成功后，生成的文件位于：

```
apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/
├── deepseek-harness-0.1.5-rc.2-win-x64.exe        # 安装程序 (~175MB)
├── deepseek-harness-0.1.5-rc.2-win-x64.exe.blockmap  # 增量更新映射
└── win-unpacked/                                   # 未打包的应用文件夹
    ├── DeepSeek Harness.exe                        # 应用主程序
    └── resources/                                  # 应用资源
```

## 品牌定制

### 修改应用名称

编辑 `apps/desktop/package.json`:

```json
{
  "name": "your-app-name",
  "productName": "Your App Name",
  "description": "Your app description"
}
```

### 修改应用ID

编辑 `apps/desktop/electron-builder.config.mjs`:

```javascript
export default {
  appId: 'com.yourcompany.yourapp',
  productName: 'Your App Name',
  // ...
}
```

或使用环境变量：

```bash
export DSH_DESKTOP_APP_ID="com.yourcompany.yourapp"
pnpm package:desktop
```

### 替换应用图标

1. 准备图标文件：
   - Windows: `.ico` 格式，推荐 256x256 或更高分辨率
   - macOS: `.icns` 格式
   - Linux: `.png` 格式

2. 将图标放置在 `apps/desktop/assets/` 目录

3. 在 `electron-builder.config.mjs` 中配置：

```javascript
export default {
  win: {
    icon: 'assets/icon.ico'
  },
  mac: {
    icon: 'assets/icon.icns'
  },
  linux: {
    icon: 'assets/icon.png'
  }
}
```

### 修改UI品牌元素

前端品牌元素位于以下位置：

- Logo: `packages/web/src/assets/`
- 文案: `packages/web/src/` 下的各个组件
- 主题色: `packages/web/src/styles/` 或主题配置文件

## 常见问题

### 1. 打包失败：网络错误

**现象**: 
```
Error: read ECONNRESET
Error: TLS connection was non-properly terminated
```

**解决方案**:
- 使用国内镜像源
- 配置代理
- 重试打包命令

### 2. Native 模块编译失败

**现象**:
```
gyp ERR! build error
```

**解决方案**:
- 安装 Visual Studio Build Tools
- 确保安装了 Windows SDK
- 运行 `npm install -g node-gyp`

### 3. 签名失败

**现象**:
```
Error: signtool.exe failed
```

**解决方案**:
- 如果没有代码签名证书，可以跳过签名
- 在 `electron-builder.config.mjs` 中添加：
  ```javascript
  win: {
    sign: false
  }
  ```

### 4. 应用图标未生效

**现象**: 使用默认 Electron 图标

**解决方案**:
- 确保图标路径正确
- 检查图标格式和尺寸
- 清理构建缓存重新打包：
  ```bash
  rm -rf apps/desktop/.desktop-build
  pnpm package:desktop
  ```

## 构建缓存

构建过程会生成缓存文件：

```
apps/desktop/.desktop-build/
├── downloads/          # 下载的依赖（Electron等）
└── targets/           # 平台特定的构建输出
    └── win-x64/       # Windows x64
        ├── dsh/       # 应用代码和依赖
        ├── runtime/   # Node.js 运行时
        └── unsigned-artifacts/  # 最终安装包
```

清理缓存：

```bash
rm -rf apps/desktop/.desktop-build
```

## 发布流程

1. **构建测试版本**:
   ```bash
   pnpm package:desktop
   ```

2. **测试安装和运行**:
   - 在干净的 Windows 系统上测试安装
   - 验证所有功能正常

3. **准备发布**:
   - 更新版本号（`package.json` 中的 `version`）
   - 更新 CHANGELOG
   - 创建 git tag

4. **分发**:
   - 上传到 GitHub Releases
   - 或部署到自己的下载服务器

## 自动更新（可选）

如需支持自动更新，参考 Electron 的 `autoUpdater` 模块：

1. 配置更新服务器
2. 在 `electron-builder.config.mjs` 中配置 `publish`
3. 在应用中集成更新检查逻辑

## 技术栈

- **Electron**: v44.0.0
- **electron-builder**: v26.15.3
- **打包格式**: NSIS (Nullsoft Scriptable Install System)
- **Node.js Runtime**: v24.17.0
- **架构**: x64

## 打包时长

典型打包时长（参考）：

- **首次打包**: 15-25 分钟（包含依赖下载和编译）
- **增量打包**: 3-8 分钟（利用缓存）

影响因素：
- 网络速度（下载 Electron、依赖）
- CPU 性能（编译 native 模块）
- 磁盘 I/O（文件复制和压缩）

## 最后更新

- 日期: 2026-09-15
- 版本: 0.1.5-rc.2
- 作者: Claude Code Assistant
