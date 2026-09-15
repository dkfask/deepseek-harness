# Windows 桌面端打包设计方案

**日期：** 2026-09-15  
**项目：** deepseek-harness Windows 桌面应用  
**状态：** 已批准

## 概述

将 `https://github.com/dkfask/deepseek-harness` 项目（品牌已修改）打包为 Windows 桌面应用，集成自动更新功能，通过 GitHub Releases 发布。初期不使用代码签名（后期可添加）。

## 目标

- ✅ 生成 Windows 安装程序（.exe）
- ✅ 集成自动更新功能
- ✅ 通过 GitHub Releases 发布和分发
- ✅ 无需代码签名证书（接受"未知发布者"警告）
- ✅ 专业的 NSIS 安装程序体验

## 技术栈

- **Electron** - 桌面应用框架（项目已集成）
- **electron-builder** - 打包工具
- **electron-updater** - 自动更新
- **NSIS** - Windows 安装程序生成器
- **GitHub Releases** - 更新服务器和分发平台

## 架构设计

### 1. 项目结构

```
deepseek-harness/
├── apps/desktop/
│   ├── electron-builder.yml      # 打包配置
│   ├── package.json              # 桌面端配置
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts         # 主进程入口
│   │   │   └── updater.ts       # 自动更新逻辑
│   │   └── preload/             # 预加载脚本
│   ├── resources/
│   │   └── icon.ico             # Windows 图标
│   └── dist/                    # 构建输出目录
└── docs/
    └── superpowers/specs/       # 设计文档
```

### 2. 环境要求

- Node.js 22.19.0+ 或 24.0.0+
- pnpm 11.7.0
- Git
- Windows 10/11（用于构建和测试）

### 3. electron-builder 配置

**文件：** `apps/desktop/electron-builder.yml`

```yaml
appId: com.yourcompany.dsh
productName: YourAppName
directories:
  buildResources: resources
  output: dist
files:
  - '**/*'
  - '!**/*.ts'
  - '!*.map'
win:
  target:
    - nsis
  artifactName: '${productName}-Setup-${version}.${ext}'
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  deleteAppDataOnUninstall: true
publish:
  provider: github
  owner: dkfask
  repo: deepseek-harness
```

**配置说明：**
- `appId`: 应用唯一标识符，格式：com.company.app
- `productName`: 用户看到的应用名称
- `nsis.oneClick: false`: 允许用户选择安装路径
- `nsis.deleteAppDataOnUninstall: true`: 卸载时清理用户数据
- `publish`: GitHub Releases 配置

### 4. 自动更新实现

**文件：** `apps/desktop/src/main/updater.ts`

**核心功能：**
- 启动后 5 秒检查更新
- 每 4 小时后台检查
- 下载进度显示
- 用户确认后安装

**检查更新流程：**
```
启动应用 → 延迟5秒 → 检查GitHub Releases → 
发现新版本 → 提示用户 → 下载更新 → 
显示进度 → 下载完成 → 提示重启 → 
退出并安装
```

**更新策略：**
- 增量更新：仅下载变化的文件
- 用户可选：不强制立即更新
- 错误处理：更新失败不影响当前版本运行

### 5. 应用图标

**要求：**
- 格式：ICO
- 尺寸：256x256（包含多个嵌入尺寸）
- 位置：`apps/desktop/resources/icon.ico`
- 包含尺寸：16x16, 32x32, 48x48, 64x64, 128x128, 256x256

**生成方法：**
- 从 PNG 源文件转换
- 使用在线工具或 ImageMagick
- 确保所有尺寸清晰

## 构建与打包流程

### 完整构建步骤

```bash
# 1. 克隆项目
git clone https://github.com/dkfask/deepseek-harness.git
cd deepseek-harness

# 2. 安装依赖
pnpm install

# 3. 构建整个项目
pnpm run build

# 4. 构建桌面端
pnpm run build:desktop

# 5. 打包 Windows 安装程序
pnpm run package:desktop:win:x64
```

### 输出文件

- **安装程序：** `apps/desktop/dist/YourAppName-Setup-x.x.x.exe`
- **解压版：** `apps/desktop/dist/win-unpacked/`
- **更新配置：** `apps/desktop/dist/latest.yml`

### 开发调试

```bash
# 开发模式运行
pnpm run dev:desktop

# 仅打包文件夹（快速测试）
pnpm run package:desktop:win:x64:dir
```

## 发布流程

### 版本号管理

**规则：** Semantic Versioning (v{major}.{minor}.{patch})

- `v1.0.0` - 初始发布
- `v1.0.1` - Bug 修复
- `v1.1.0` - 新功能
- `v2.0.0` - 重大更新

**更新位置：**
- `apps/desktop/package.json` → `version` 字段
- 保持根目录 `package.json` 同步

### GitHub Releases 发布

**步骤：**

1. **更新版本号**
```bash
# 编辑 apps/desktop/package.json
# 修改 "version": "1.0.0"
```

2. **创建 Git tag**
```bash
git add .
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin master
git push origin v1.0.0
```

3. **构建安装包**
```bash
pnpm run build
pnpm run build:desktop
pnpm run package:desktop:win:x64
```

4. **创建 GitHub Release**
   - 访问：`https://github.com/dkfask/deepseek-harness/releases/new`
   - Tag: v1.0.0
   - Title: v1.0.0 - 初始发布
   - Description: 添加更新日志
   - 上传文件：
     - `YourAppName-Setup-1.0.0.exe`
     - `latest.yml`

5. **发布 Release**
   - 点击 "Publish release"
   - 用户即可下载和自动更新

### latest.yml 文件

electron-updater 需要此文件来检查更新：

```yaml
version: 1.0.0
files:
  - url: YourAppName-Setup-1.0.0.exe
    sha512: <文件SHA512哈希>
    size: <文件大小字节数>
path: YourAppName-Setup-1.0.0.exe
sha512: <文件SHA512哈希>
releaseDate: '2026-09-15T10:00:00.000Z'
```

此文件由 electron-builder 自动生成，位于 `apps/desktop/dist/` 目录。

## 代码签名

### 当前状态：无签名

**影响：**
- ✅ 应用可以正常运行
- ❌ 安装时显示"Windows 已保护你的电脑"警告
- ❌ 显示"未知发布者"
- ❌ 用户需额外点击才能安装

**用户安装流程（无签名）：**
1. 下载 `.exe` 文件
2. 双击运行
3. Windows SmartScreen 警告："Windows 已保护你的电脑"
4. 点击"更多信息"
5. 点击"仍要运行"
6. 正常安装流程

**给用户的说明：**
在 README 中添加：

> **Windows 安装提示：** 由于应用暂未购买代码签名证书，Windows 会显示"未知发布者"警告。这是正常现象，请点击"更多信息" → "仍要运行"继续安装。我们的应用是安全的，未来版本将添加代码签名。

### 后期添加签名

**证书类型：**
- **标准代码签名（OV）**: ~$100-200/年
- **EV 代码签名**: ~$300-500/年（更高信任级别）

**供应商：**
- Sectigo
- DigiCert
- GlobalSign

**添加签名配置：**
```yaml
# electron-builder.yml
win:
  certificateFile: path/to/certificate.pfx
  certificatePassword: <password>
  signingHashAlgorithms:
    - sha256
  signDlls: true
```

## 测试清单

### 打包后测试项

- [ ] 安装程序能否正常运行
- [ ] 安装到自定义路径
- [ ] 应用能否正常启动
- [ ] 主要功能是否正常工作
- [ ] 桌面快捷方式是否创建
- [ ] 开始菜单项是否存在
- [ ] 卸载程序是否能完全清理
- [ ] 自动更新检测（发布第二个版本后测试）
- [ ] Windows 10 兼容性
- [ ] Windows 11 兼容性

### 自动更新测试

1. 安装 v1.0.0
2. 发布 v1.0.1 到 GitHub Releases
3. 启动 v1.0.0 应用
4. 验证是否检测到更新
5. 验证下载进度显示
6. 验证安装后版本为 v1.0.1

## 用户文档

### README 安装说明

```markdown
## 下载安装

### Windows

1. 访问 [Releases 页面](https://github.com/dkfask/deepseek-harness/releases)
2. 下载最新版本的 `YourAppName-Setup-x.x.x.exe`
3. 双击运行安装程序
4. **重要：** 如果看到 Windows SmartScreen 警告，点击"更多信息" → "仍要运行"
5. 按照安装向导完成安装

### 自动更新

应用内置自动更新功能，启动时会自动检查新版本。发现新版本时会提示您下载安装。
```

## 后续扩展

### 短期（1-3 个月）
- [ ] 添加 macOS 支持
- [ ] GitHub Actions CI/CD 自动构建
- [ ] 购买代码签名证书

### 中期（3-6 个月）
- [ ] 崩溃报告收集（Sentry）
- [ ] 用户分析（匿名）
- [ ] 应用内反馈功能

### 长期（6-12 个月）
- [ ] Linux 支持
- [ ] 企业版功能
- [ ] 多语言支持

## 风险与缓解

### 风险 1：无签名导致用户安装困难
**影响：** 中等  
**缓解：** 
- 提供详细的安装说明文档
- 制作安装视频教程
- 考虑购买签名证书

### 风险 2：自动更新失败
**影响：** 低  
**缓解：**
- 错误处理和日志记录
- 手动下载安装作为备选
- 用户可禁用自动更新

### 风险 3：GitHub Releases 下载速度慢
**影响：** 低  
**缓解：**
- 提供国内镜像（如有需要）
- 压缩安装包大小
- 增量更新减少下载量

## 成功标准

- ✅ 能够生成可安装的 Windows .exe 文件
- ✅ 安装后应用能正常运行所有功能
- ✅ 自动更新功能正常工作
- ✅ 用户能够成功安装（即使有 SmartScreen 警告）
- ✅ 卸载功能完整清理所有文件
- ✅ 文档清晰完整

## 参考资料

- [Electron 官方文档](https://www.electronjs.org/docs)
- [electron-builder 文档](https://www.electron.build/)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [项目仓库](https://github.com/dkfask/deepseek-harness)

---

**审批状态：** ✅ 已批准  
**批准日期：** 2026-09-15  
**下一步：** 创建实施计划
