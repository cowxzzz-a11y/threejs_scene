# threejs_scene

这是一个独立的 Three.js 小型场景查看器，支持：

- 加载本地 `glb / gltf`
- 加载本地 `hdr`
- 查看对象层级
- 隐藏或显示对象
- 选中对象并拖动位置
- 查看和替换材质类型
- 调整常见材质参数

## 目录说明

- `index.html`
  页面结构和界面样式
- `src/main.js`
  应用入口，只负责组装模块和绑定事件
- `src/modules/`
  按功能拆分的业务模块，比如材质、检查器、对象管理、资源加载
- `src/shaders/`
  自定义 Shader 目录，后续可以继续扩展更多效果
- `src/scene/`
  场景、相机、灯光、控制器初始化
- `assets/`
  示例模型和 HDR 资源

## 运行方式

不要直接双击 `index.html`，因为浏览器通过 `file://` 打开时，模型和 HDR 资源通常会加载失败。

第一次运行先安装依赖：

```powershell
npm install
```

然后启动开发服务器：

```powershell
npm run dev
```

打开终端里显示的地址，例如：

```text
http://127.0.0.1:5173/
```

## 当前功能

- 默认尝试加载 `assets/scene.glb`
- 默认尝试加载 `assets/studio_small_09_4k.hdr`
- 可以切换查看 `scene.glb` 和 `tea.glb`
- 可以手动选择本地 GLB
- 可以手动选择本地 HDR
- 可以在右侧标签页里查看对象、材质、基础信息
- 可以把材质切换成 Three.js 预制材质或自定义 Shader
