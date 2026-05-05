/**
 * 访问日志管理模块 (access_log.js)
 * --------------------------------------------------
 * 逻辑说明：
 * 1. 数据展示：使用 jquery.table.js 展示访问记录，支持虚拟滚动。
 * 2. 实时刷新：支持手动刷新日志，掌握最新访问动态。
 * 3. 日志清理：一键清空历史冗余数据。
 */

const access_log = {
    gridId: 'accessLogGrid',

    /**
     * 模块初始化入口
     */
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
                    <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-reload'" onclick="access_log.reloadData()">刷新日志</a>
                    <span style="color:#ccc">|</span>
                    <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-clear'" onclick="access_log.clearLogs()" style="color:#ff4d4f">清空日志</a>
                </div>
                <div data-options="region:'center',border:false" style="padding:0;">
                    <div id="${this.gridId}" style="width:100%; height:100%;"></div>
                </div>
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
        $(`#${this.gridId}`).table({
            columns: [[
                { field: 'id', title: 'ID', width: 60, align: 'center' },
                { 
                    field: 'mapping_name', title: '映射名称', width: 120,
                    formatter: (v, row) => `<span title="来自端口: ${row.listen_port} -> 转发至: ${row.target_host}:${row.target_port}">${v}</span>`
                },
                { field: 'client_name', title: '所属客户端', width: 100, align: 'center' },
                { 
                    field: 'remote_addr', title: '来源 IP', width: 150, align: 'center',
                    formatter: (value) => `<span style="color:#2a5298; font-family:monospace">${value}</span>`
                },
                { 
                    field: 'access_time', title: '访问时间', width: 180, align: 'center',
                    formatter: (value) => {
                        try { return mmsrv.formatTime(value) || value; } catch(e) { return value; }
                    }
                },
                { 
                    field: 'status', title: '状态', width: 100, align: 'center',
                    formatter: (value) => {
                        const status = value || 'SUCCESS';
                        const color = status.toLowerCase() === 'success' ? '#52c41a' : '#ff4d4f';
                        return `<span style="color:${color}">${status.toUpperCase()}</span>`;
                    }
                }
            ]],
            data: []
        });

        this.reloadData();
    },

    /**
     * 加载数据
     */
    reloadData: async function() {
        const $grid = $(`#${this.gridId}`);
        app.showLoading($grid);
        
        try {
            const data = await mmsrv.server.access_log.list();
            $grid.table('loadData', data);
        } catch (e) {
            console.error('加载日志失败:', e);
        } finally {
            app.hideLoading($grid);
        }
    },

    /**
     * 清空日志
     */
    clearLogs: function() {
        $.messager.confirm('确认', '确定要清空所有访问日志吗？此操作不可恢复。', async (r) => {
            if (r) {
                app.showLoading('#mainLayout');
                try {
                    const res = await mmsrv.server.access_log.clear();
                    if (res.success) {
                        $.messager.show({ title: '成功', msg: '日志已清空' });
                        this.reloadData();
                    } else {
                        $.messager.alert('错误', res.error, 'error');
                    }
                } finally {
                    app.hideLoading('#mainLayout');
                }
            }
        });
    }
};
