/**
 * 端口映射管理模块 (port_mapping.js)
 * --------------------------------------------------
 * 逻辑说明：
 * 1. 初始化 (init)：配置并展示端口映射列表。
 * 2. 联动选择：在新增/编辑时，动态加载 NPC 客户端列表供用户选择。
 * 3. 状态切换：支持在表格中直接切换规则的启用/禁用状态。
 * 4. 校验逻辑：前端对输入端口范围和必填项进行基础校验。
 */

const port_mapping = {
    gridId: 'portMappingGrid',

    init: async function () {
        this.renderLayout();
        this.initGrid();
    },

    /**
     * 渲染页面基础布局
     */
    renderLayout: function () {
        const html = `
            <div class="easyui-layout" data-options="fit:true">
                <div data-options="region:'north',border:false" style="height:40px; padding:5px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; align-items:center; gap:5px;">
                    <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-add'" onclick="port_mapping.showAddDialog()">新增映射</a>
                    <span style="color:#ccc">|</span>
                    <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-reload'" onclick="port_mapping.reloadData()">刷新</a>
                </div>
                <div data-options="region:'center',border:false" style="padding:0;">
                    <div id="${this.gridId}" style="width:100%; height:100%;"></div>
                </div>
            </div>

            <!-- 对话框部分保持不变 -->
            <div id="mappingDialog" style="display:none; padding:20px; overflow:hidden">
                <form id="mappingForm">
                    <input type="hidden" name="id">
                    <div style="margin-bottom:15px">
                        <label class="label" style="display:block; margin-bottom:5px">所属客户端</label>
                        <input id="npcClientCombo" name="npc_client_id" style="width:100%; height:32px">
                    </div>
                    <div style="margin-bottom:15px">
                        <label class="label" style="display:block; margin-bottom:5px">映射名称</label>
                        <input name="name" class="easyui-textbox" data-options="required:true, prompt:'例如：公司OA系统'" style="width:100%; height:32px">
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:15px">
                        <div style="flex:1">
                            <label class="label" style="display:block; margin-bottom:5px">监听端口 (外部)</label>
                            <input name="listen_port" class="easyui-numberbox" data-options="required:true, min:1, max:65535" style="width:100%; height:32px">
                        </div>
                        <div style="flex:1">
                            <label class="label" style="display:block; margin-bottom:5px">协议</label>
                            <select name="protocol" class="easyui-combobox" data-options="editable:false" style="width:100%; height:32px">
                                <option value="tcp">TCP</option>
                                <option value="udp">UDP</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:15px">
                        <div style="flex:2">
                            <label class="label" style="display:block; margin-bottom:5px">目标地址 (内网IP)</label>
                            <input name="target_host" class="easyui-textbox" data-options="required:true" value="127.0.0.1" style="width:100%; height:32px">
                        </div>
                        <div style="flex:1">
                            <label class="label" style="display:block; margin-bottom:5px">目标端口</label>
                            <input name="target_port" class="easyui-numberbox" data-options="required:true, min:1, max:65535" style="width:100%; height:32px">
                        </div>
                    </div>
                </form>
            </div>
        `;
        const $target = $(this.targetContainer || '#contentFrame');
        $target.html(html);
        $.parser.parse($target);
    },

    /**
     * 初始化数据表格 (使用 jquery.table.js)
     */
    initGrid: function () {
        $(`#${this.gridId}`).table({
            columns: [[
                { field: 'id', title: 'ID', width: 60, align: 'center' },
                { field: 'name', title: '映射名称', width: 150 },
                { field: 'client_name', title: '所属客户端', width: 150 },
                { 
                    field: 'listen_port', title: '监听端口', width: 100, align: 'center',
                    formatter: (value) => `<b style="color:#2a5298">${value}</b>`
                },
                { 
                    field: 'target', title: '内网目标地址', width: 180,
                    formatter: (value, row) => `${row.target_host}:${row.target_port}`
                },
                { field: 'protocol', title: '协议', width: 80, align: 'center', formatter: (value) => value.toUpperCase() },
                { 
                    field: 'status', title: '状态', width: 100, align: 'center',
                    formatter: (value, row) => {
                        const checked = value === 1 ? 'checked' : '';
                        return `<input type="checkbox" ${checked} onchange="port_mapping.toggleStatus(${row.id}, this.checked)"> ${value === 1 ? '启用' : '禁用'}`;
                    }
                },
                {
                    field: '_operate', title: '操作', width: 180, align: 'center',
                    formatter: (value, row) => {
                        return `
                            <a href="javascript:void(0)" style="color:#1890ff; text-decoration:none; margin-right:10px" onclick="port_mapping.showEditDialog(${JSON.stringify(row).replace(/"/g, '&quot;')})">编辑</a>
                            <a href="javascript:void(0)" style="color:#ff4d4f; text-decoration:none" onclick="port_mapping.deleteMapping(${row.id})">删除</a>
                        `;
                    }
                }
            ]],
            data: []
        });

        this.reloadData();
    },

    reloadData: async function() {
        const $grid = $(`#${this.gridId}`);
        app.showLoading($grid);
        
        try {
            const data = await mmsrv.server.port_mapping.list();
            $grid.table('loadData', data);
        } catch (e) {
            console.error('加载数据失败:', e);
        } finally {
            app.hideLoading($grid);
        }
    },

    /**
     * 弹出新增对话框
     */
    showAddDialog: async function () {
        $('#mappingForm').form('clear');
        $('#mappingForm').form('load', { target_host: '127.0.0.1', protocol: 'tcp' });
        await this.initClientCombo();
        this.openDialog('新增端口映射', async () => this.saveMapping('add'));
    },

    /**
     * 弹出编辑对话框
     */
    showEditDialog: async function (row) {
        $('#mappingForm').form('clear');
        await this.initClientCombo();
        $('#mappingForm').form('load', row);
        this.openDialog('编辑端口映射', async () => this.saveMapping('update'));
    },

    /**
     * 初始化客户端选择下拉框
     */
    initClientCombo: async function () {
        const clients = await mmsrv.server.npc_client.list();
        $('#npcClientCombo').combobox({
            data: clients,
            valueField: 'id',
            textField: 'client_name',
            editable: false,
            required: true,
            prompt: '选择所属 NPC 客户端'
        });
    },

    /**
     * 保存映射逻辑 (新增或更新)
     */
    saveMapping: async function (type) {
        if (!$('#mappingForm').form('validate')) return;
        
        const data = {};
        $('#mappingForm').serializeArray().forEach(item => data[item.name] = item.value);

        $('#saveMappingBtn').linkbutton('disable').linkbutton({ text: '保存中...' });
        try {
            const res = await mmsrv.server.port_mapping[type](data);
            if (res.success) {
                $('#mappingDialog').dialog('close');
                this.reloadData();
                $.messager.show({ title: '成功', msg: '映射保存成功' });
            } else {
                $.messager.alert('错误', res.error, 'error');
            }
        } finally {
            $('#saveMappingBtn').linkbutton('enable').linkbutton({ text: '确定' });
        }
    },

    /**
     * 对话框通用方法
     */
    openDialog: function (title, onSave) {
        $('#mappingDialog').dialog({
            title: title,
            width: 450,
            height: 380,
            modal: true,
            closed: false,
            buttons: [{
                text: '确定',
                id: 'saveMappingBtn',
                iconCls: 'icon-ok',
                handler: onSave
            }, {
                text: '取消',
                handler: () => $('#mappingDialog').dialog('close')
            }]
        });
    },

    /**
     * 删除映射
     */
    deleteMapping: function (id) {
        $.messager.confirm('确认', '确定要删除此端口映射规则吗？', async (r) => {
            if (r) {
                const res = await mmsrv.server.port_mapping.delete(id);
                if (res.success) {
                    this.reloadData();
                } else {
                    $.messager.alert('错误', res.error, 'error');
                }
            }
        });
    },

    /**
     * 切换状态
     */
    toggleStatus: async function (id, checked) {
        const status = checked ? 1 : 0;
        const res = await mmsrv.server.port_mapping.toggleStatus(id, status);
        if (!res.success) {
            $.messager.alert('错误', res.error, 'error');
            this.reloadData();
        }
    }
};
