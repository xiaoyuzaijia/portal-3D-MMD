# portal-3D-MMD

使用摄像头进行脸部捕捉，然后在显示屏上实现传送门效果的裸眼3D。

## 硬件

你至少需要一个摄像和显示器，最好是16:9的显示器并将它竖屏摆放。

## MMD

你需要自己下载MMD模型和动作数据，并在`config\scene_config.json`中设置好路径。

## 依赖

- [Node.js](https://nodejs.org/) >= 18
- 克隆项目后运行 `npm install` 安装依赖（Three.js 0.170、Tweakpane 4）
- 摄像头（MediaPipe FaceMesh 通过 CDN 加载，无需额外安装）
- 现代浏览器（Chrome / Edge 推荐）

## 校准

校准需要在左上角打开校准界面。具体校准步骤看老项目up主的视频 [BV16y4y1T7Tz](https://www.bilibili.com/video/BV16y4y1T7Tz)

## 感谢

[head-tracked-3d](https://github.com/rossning92/head-tracked-3d)