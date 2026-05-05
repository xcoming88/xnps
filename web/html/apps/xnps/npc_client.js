/**
 * NPC 客户端管理模块 (npc_client.js)
 * --------------------------------------------------
 * 逻辑说明：
 * 1. 初始化 (init)：在首页导航点击后通过 app.js 动态加载并调用。
 * 2. 数据展示：使用 EasyUI DataGrid 展示客户端列表，并实时判断在线状态。
 * 3. 异步操作：通过 mmsrv.server.npc_client 代理调用后端方法。
 * 4. 安全交互：删除操作会弹出二次确认，告知级联删除风险。
 */

const npc_client = {
    // 数据表格容器 ID
    gridId: 'npcClientGrid',

    /**
     * 模块初始化入口
     */
    init: async function () {
        this.injectStyles();
        this.renderLayout();
        this.initGrid();
    },

    /**
     * 动态注入所需样式 (如修复 icon-copy 缺失)
     */
    injectStyles: function() {
        // 移除自定义绘图，改用 EasyUI 标准图标
    },

    /**
     * 渲染页面基础布局
     */
    renderLayout: function () {
        const html = `
            <div class="easyui-layout" data-options="fit:true">
                <div data-options="region:'center',border:false" style="padding:10px;">
                    <table id="${this.gridId}"></table>
                </div>
            </div>

            <!-- 新增/编辑客户端对话框 -->
            <div id="npcClientDialog" style="display:none; padding:20px; overflow:hidden">
                <form id="npcClientForm">
                    <input type="hidden" name="id">
                    <div style="margin-bottom:15px">
                        <label class="label" style="display:block; margin-bottom:5px">客户端名称</label>
                        <input name="client_name" class="easyui-textbox" data-options="required:true, prompt:'例如：家里的树莓派'" style="width:100%; height:32px">
                    </div>
                    <div style="color:#888; font-size:12px;">
                        提示：新增成功后将自动生成 VKey，用于客户端连接认证。
                    </div>
                </form>
            </div>
        `;
        const $target = $(this.targetContainer || '#contentFrame');
        $target.html(html);
        $.parser.parse($target);
    },

    /**
     * 初始化数据表格
     */
    initGrid: function () {
        $(`#${this.gridId}`).datagrid({
            fit: true,
            border: true,
            singleSelect: true,
            pagination: false,
            rownumbers: true,
            fitColumns: true,
            striped: true,
            loadMsg: '', // 🚀 禁用原生 Loading
            loader: async function (param, success, error) {
                app.showLoading(npc_client.targetContainer || '#contentFrame', '加载中...');
                try {
                    const data = await mmsrv.server.npc_client.list();
                    // 存活性检查：如果节点已不存在，说明用户已经切换了页面
                    if ($(`#${npc_client.gridId}`).length === 0) return;
                    success(data);
                } catch (e) {
                    if ($(`#${npc_client.gridId}`).length > 0) error(e);
                } finally {
                    app.hideLoading(npc_client.targetContainer || '#contentFrame');
                }
            },
            onLoadSuccess: function() {
                // 解析表格中格式化出的组件
                $.parser.parse($(`#${npc_client.gridId}`).datagrid('getPanel'));
            },
            columns: [[
                { field: 'id', title: 'ID', width: 50, align: 'center' },
                { field: 'client_name', title: '客户端名称', width: 150 },
                {
                    field: 'client_key', title: '连接密钥 (VKey)', width: 220,
                    formatter: (value) => {
                        return `<span style="font-family:monospace; color:#2a5298; margin-right:8px;">${value}</span> 
                                <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-more'" 
                                   style="vertical-align:middle;"
                                   onclick="npc_client.copyKey('${value}')" title="复制"></a>`;
                    }
                },
                {
                    field: 'is_online', title: '状态', width: 80, align: 'center',
                    formatter: (value) => {
                        if (value === 1) {
                            return '<span style="background:#4caf50; color:#fff; padding:2px 6px; border-radius:10px; font-size:12px;">在线</span>';
                        } else {
                            return '<span style="background:#9e9e9e; color:#fff; padding:2px 6px; border-radius:10px; font-size:12px;">离线</span>';
                        }
                    }
                },
                { 
                    field: 'connect_ip', title: '最近连接 IP', width: 120, align: 'center',
                    formatter: (value) => value ? `<span style="color:#2a5298; font-family:monospace;">${value}</span>` : '<span style="color:#ccc">-</span>'
                },
                { 
                    field: 'last_heartbeat', title: '最后心跳', width: 150, align: 'center',
                    formatter: (value) => {
                        if (!value) return '<span style="color:#ccc">-</span>';
                        const date = new Date(value);
                        // 转换为本地时区字符串：YYYY-MM-DD HH:mm:ss
                        const Y = date.getFullYear();
                        const M = String(date.getMonth() + 1).padStart(2, '0');
                        const D = String(date.getDate()).padStart(2, '0');
                        const h = String(date.getHours()).padStart(2, '0');
                        const m = String(date.getMinutes()).padStart(2, '0');
                        const s = String(date.getSeconds()).padStart(2, '0');
                        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
                    }
                },
                {
                    field: '_operate', title: '操作', width: 180, align: 'center',
                    formatter: (value, row) => {
                        // 使用平铺按钮样式，增加间距和图标感
                        return `
                            <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-edit'" 
                               style="color:#1890ff; margin-right:5px" 
                               onclick="npc_client.showEditDialog(${JSON.stringify(row).replace(/"/g, '&quot;')})">编辑</a>
                            <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-cancel'" 
                               style="color:#ff4d4f; margin-right:5px" 
                               onclick="npc_client.deleteClient(${row.id})">删除</a>
                            <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-reload'" 
                               style="color:#2a5298" 
                               onclick="npc_client.refreshKey(${row.id})">重置Key</a>
                        `;
                    }
                }
            ]],
            toolbar: [{
                text: '新增客户端',
                iconCls: 'icon-add',
                handler: () => this.showAddDialog()
            }, '-', {
                text: '刷新',
                iconCls: 'icon-reload',
                handler: () => $(`#${this.gridId}`).datagrid('reload')
            }]
        });
    },

    /**
     * 重新加载数据
     */
    reloadData: function() {
        $(`#${this.gridId}`).datagrid('reload');
    },

    /**
     * 弹出新增对话框
     */
    showAddDialog: function () {
        $('#npcClientForm').form('clear');
        this.openDialog('新增客户端', async () => {
            const name = $('input[name="client_name"]').val();
            if (!name) return;

            $('#saveNpcBtn').linkbutton('disable').linkbutton({ text: '保存中...' });
            try {
                const res = await mmsrv.server.npc_client.add(name);
                if (res.success) {
                    $('#npcClientDialog').dialog('close');
                    $(`#${this.gridId}`).datagrid('reload');
                } else {
                    $.messager.alert('错误', res.error, 'error');
                }
            } finally {
                $('#saveNpcBtn').linkbutton('enable').linkbutton({ text: '确定' });
            }
        });
    },

    /**
     * 弹出编辑对话框
     */
    showEditDialog: function (row) {
        $('#npcClientForm').form('load', row);
        this.openDialog('编辑客户端', async () => {
            const name = $('input[name="client_name"]').val();
            $('#saveNpcBtn').linkbutton('disable').linkbutton({ text: '保存中...' });
            try {
                const res = await mmsrv.server.npc_client.update(row.id, name);
                if (res.success) {
                    $('#npcClientDialog').dialog('close');
                    $(`#${this.gridId}`).datagrid('reload');
                } else {
                    $.messager.alert('错误', res.error, 'error');
                }
            } finally {
                $('#saveNpcBtn').linkbutton('enable').linkbutton({ text: '确定' });
            }
        });
    },

    /**
     * 对话框通用打开方法
     */
    openDialog: function (title, onSave) {
        $('#npcClientDialog').dialog({
            title: title,
            width: 350,
            height: 240,
            modal: true,
            closed: false,
            buttons: [{
                text: '确定',
                id: 'saveNpcBtn',
                iconCls: 'icon-ok',
                handler: onSave
            }, {
                text: '取消',
                handler: () => $('#npcClientDialog').dialog('close')
            }]
        });
    },

    /**
     * 删除客户端（包含级联确认）
     */
    deleteClient: function (id) {
        $.messager.confirm('极其重要', '删除此客户端将同时删除其名下所有的“端口映射”及“日志”，此操作不可恢复！是否确定？', async (r) => {
            if (r) {
                const res = await mmsrv.server.npc_client.delete(id);
                if (res.success) {
                    $(`#${this.gridId}`).datagrid('reload');
                } else {
                    $.messager.alert('错误', res.error, 'error');
                }
            }
        });
    },

    /**
     * 重置密钥
     */
    refreshKey: function (id) {
        $.messager.confirm('确认', '重置密钥会导致现有的客户端连接断开，需要更新客户端配置，是否继续？', async (r) => {
            if (r) {
                const res = await mmsrv.server.npc_client.refreshKey(id);
                if (res.success) {
                    $.messager.show({ title: '成功', msg: '密钥重置成功' });
                    $(`#${this.gridId}`).datagrid('reload');
                } else {
                    $.messager.alert('错误', res.error, 'error');
                }
            }
        });
    },

    /**
     * 复制 VKey 到剪贴板
     */
    copyKey: function (key) {
        mmsrv.copyToClipboard(key);
        $.messager.show({ title: '成功', msg: '密钥已复制到剪贴板' });
    }
};
