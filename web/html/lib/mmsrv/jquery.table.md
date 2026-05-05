# jquery.table.js 组件拓展说明

为了 100% 还原并平替 EasyUI Datagrid 且兼顾十万级数据渲染体感，现已新增以下高阶配置和事件绑定：

## 🌟 新增支持属性 (初始化时使用)

| 属性名 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `singleSelect` | `boolean` | `true` | 是否为单选模式。若设为 `false` 则支持点击行多选，并连通 CheckAll 钩索。 |
| `onClickRow` | `Function` | `null` | 行点击回调：`function(dataIndex, rowData)` |

## 📦 列定义 (Columns) 拓展
```javascript
columns: [[
    { field: 'ck', checkbox: true }, // 🚀 新增：多选 Checkbox 列渲染支持
    { field: 'id', title: '编号(ID)', width: 100 },
    { field: 'name', title: '名称', width: 200, align: 'right' } // 支持 align 居中对齐排版
]]
```

## 🎮 面板级 API 调用规范

直接通过 `$().table('方法名', 传入参数)` 使用：

| 方法名称 | 参数 | 说明 |
| :--- | :--- | :--- |
| `getSelected` | `无` | 返回首个选中的行数据对象（无则返回 `null`）|
| `getSelections` | `无` | 返回一个包装了当前 **所有选中行** 数据对象的数组 `[{}, {}]` |
| `selectAll` | `无` | 全选当前过滤集下的所有可见数据，并打上 `Checked` 钩索 |
| `unselectAll`| `无` | 撤销所有选择 |
| `getData` | `无` | 返回当前加载并 **过滤后** 的可见数据集数组 `[{}, {}]` |
| `getFullData` | `无` | 返回当前加载的 **全量** 数据集数组 `[{}, {}]` |

## 🎨 视觉反馈细节及双击
*   **Hover 高亮**：光标划过时自动赋予 `.datagrid-row-over` 响应。
*   **点击选中**：触发 `.datagrid-row-selected` 并缓存数据。
*   **抗冒泡 DblClick**：双击单元格时，**不再触发**行选中偏好，只触发快捷复制功能。

目前 `demo/index.js` 已被更新为 `singleSelect: false` 启用多选 Checkbox 进行直观连通测试。
