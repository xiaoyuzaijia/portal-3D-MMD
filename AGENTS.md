# AGENTS.md（中文）

> 详细的英文技术文档见 [CLAUDE.md](./CLAUDE.md)。本文件提供中文补充指引，两者互补。

## 项目概述

裸眼 3D 展示 Demo。通过 MediaPipe 人脸追踪 + Three.js 离轴投影（off-axis projection），实现运动视差效果——当你移动头部时，屏幕如同一个通向真实 3D 空间的窗口。支持 MMD（MikuMikuDance）模型渲染与 VMD 动画。

## 常用命令

```bash
npm run dev       # 启动开发服务器 → http://localhost:5173
npm run build     # 类型检查 + 打包 → dist/
npm run preview   # 预览生产构建
npx tsc --noEmit  # 仅类型检查
```

## 架构速览

```
index.html → src/main.ts（入口 + 渲染循环）
               ├── head-tracker.ts    MediaPipe FaceMesh 人脸追踪（CDN 加载）
               ├── calibration.ts     Tweakpane 校准 UI + 离轴投影矩阵
               ├── scene.ts           Three.js 场景（光照、地面、装饰、校准方块）
               ├── mmd.ts             MMD 模型加载与动画
               └── debug-overlay.ts   屏幕调试信息（FPS/追踪状态/错误）
```

## 关键约定

### Three.js 版本锁定
- **Three.js 0.170 已锁定**，不可升级。这是最后一个内置 MMD 示例的版本（r172 起已废弃并移除）。
- `@types/three` 必须与 Three.js 版本匹配（`^0.170.0`）。

### Tweakpane 类型问题
- Tweakpane 4 的类型声明（`.d.ts`）不完整：`addFolder()` 和 `addBinding()` 运行时存在但类型中缺失。
- 调用这些方法时需将 `pane` 转换为 `any`。参见 `calibration.ts` 中的用法。

### 头部追踪管道
- MediaPipe FaceMesh 通过 jsdelivr CDN 加载（`@mediapipe/face_mesh@0.4`），无 npm 包、无 TF.js。
- **关键**：`Module.locateFile` 必须在加载 CDN 脚本**之前**设置到 `window` 上（参见 `head-tracker.ts` 中的注释）。
- 追踪循环通过 `requestAnimationFrame` 链式调用 `send()`，每次只发一帧（避免 Emscripten WASM 双重初始化）。

### 离轴投影（核心 3D 技巧）
- 相机位置对追踪数据取反（`camera.position.set(-offsetX, -offsetY, dist)`）——这是"窗口视差"的核心。
- 投影矩阵使用非对称视锥体，使屏幕平面（z=0）保持视觉固定。

### 坐标系统
- 瞳孔坐标从 `[0,1]` 映射到 `[-1,1]`（`irisMid * 2 - 1`）。
- 在 `head-tracker.ts` 中不取反；取反仅在 `calibration.ts` 的 `applyCameraTransform()` 中进行。
- `<video>` 元素通过 CSS `transform: scaleX(-1)` 镜像显示，但追踪数据本身不镜像。

### 平滑参数
- 瞳孔：50/50（响应较快）
- IPD（瞳距）：90/10（高度阻尼）

## 注意事项

- 开发时需要摄像头权限，否则头部追踪会失败并回退到演示模式。
- MMD 模型文件放在 `public/mmd/`（不纳入版本控制），加载失败会被静默捕获。
- 调试叠加层（左下角绿色等宽字体）实时显示 FPS、瞳孔坐标、IPD 和相机位置。
- `old/` 目录下有两个旧项目供参考，不要修改它们。
