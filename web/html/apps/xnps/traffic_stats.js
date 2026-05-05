/**
 * 流量统计管理模块 (traffic_stats.js)
 * --------------------------------------------------
 * 逻辑说明：
 * 1. 汇总展示：使用 jquery.table.js 展示各映射规则的累计流量。
 * 2. 数据转换：将原始字节数转换为 KB/MB/GB/TB 等易读单位。
 * 3. 总览卡片：顶部显示全站今日流量与累计流量。
 */

const traffic_stats = {
    gridId: 'trafficStatsGrid',

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
                <!-- 顶部统计卡片 -->
                <div data-options="region:'north',border:false" style="height:110px; padding:15px; background:#f0f2f5; display:flex; gap:20px;">
                    <div class="stat-card">
                        <div class="stat-label">今日总流量</div>
                        <div class="stat-value" id="todayTraffic">0 B</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">累计总流量</div>
                        <div class="stat-value" id="totalTraffic">0 B</div>
                    </div>
                    <div style="flex:1; display:flex; align-items:flex-end; justify-content:flex-end;">
                        <a href="javascript:void(0)" class="easyui-linkbutton" data-options="plain:true,iconCls:'icon-reload'" onclick="traffic_stats.reloadData()">刷新数据</a>
                    </div>
                </div>
                
                <div data-options="region:'center',border:false" style="padding:0;">
                    <div id="${this.gridId}" style="width:100%; height:100%;"></div>
                </div>
            </div>

            <!-- 流量图表窗口 -->
            <div id="trafficChartWin" class="easyui-window" title="流量趋势分析" data-options="modal:true,closed:true,iconCls:'icon-large-chart'" style="width:800px;height:450px;padding:10px;">
                <div id="chartContainer" style="width:100%;height:100%;"></div>
            </div>

            <style>
                .stat-card {
                    background: #fff;
                    border-radius: 8px;
                    padding: 15px 25px;
                    min-width: 200px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    border-left: 4px solid #1890ff;
                }
                .stat-label { color: #888; font-size: 13px; margin-bottom: 8px; }
                .stat-value { color: #1e3c72; font-size: 24px; font-weight: bold; }
                .client-link { color: #1890ff; cursor: pointer; text-decoration: underline; }
                .client-link:hover { color: #40a9ff; }
            </style>
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
                { field: 'port_mapping_id', title: '映射 ID', width: 80, align: 'center' },
                { 
                    field: 'mapping_name', title: '映射名称', width: 150,
                    formatter: (v, row) => `<span title="来自端口: ${row.listen_port} -> 转发至: ${row.target_host}:${row.target_port}">${v}</span>`
                },
                { 
                    field: 'client_name', title: '所属客户端 (查看趋势)', width: 180,
                    formatter: (v, row) => `<span class="client-link" onclick="traffic_stats.showChart(${row.port_mapping_id}, '${row.mapping_name}')">📊 ${v}</span>`
                },
                { field: 'listen_port', title: '监听端口', width: 100, align: 'center' },
                { 
                    field: 'total_sent', title: '累计上传', width: 120, align: 'right',
                    formatter: (v) => this.formatBytes(v)
                },
                { 
                    field: 'total_received', title: '累计下载', width: 120, align: 'right',
                    formatter: (v) => this.formatBytes(v)
                },
                { 
                    field: 'total_traffic', title: '总流量', width: 150, align: 'right',
                    styler: () => 'font-weight:bold; color:#1890ff;',
                    formatter: (v) => this.formatBytes(v)
                }
            ]],
            data: []
        });

        this.reloadData();
    },

    /**
     * 显示 ECharts 趋势图
     */
    showChart: async function(id, name) {
        $('#trafficChartWin').window('open').window('setTitle', `[${name}] 最近 30 天流量趋势`);
        const myChart = echarts.init(document.getElementById('chartContainer'));
        myChart.showLoading();

        try {
            const data = await mmsrv.server.traffic_stats.getMonthlyStats(id);
            const dates = data.map(item => item.date);
            const values = data.map(item => (item.total / (1024 * 1024)).toFixed(2)); // 转换为 MB

            const option = {
                tooltip: { trigger: 'axis', formatter: '{b}<br/>流量: {c} MB' },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', boundaryGap: false, data: dates },
                yAxis: { type: 'value', name: '流量 (MB)' },
                series: [{
                    name: '日流量',
                    type: 'line',
                    smooth: true,
                    areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(24,144,255,0.3)' }, { offset: 1, color: 'rgba(24,144,255,0)' }]) },
                    lineStyle: { color: '#1890ff', width: 3 },
                    itemStyle: { color: '#1890ff' },
                    data: values
                }]
            };
            myChart.setOption(option);
        } catch (e) {
            console.error('加载图表失败:', e);
        } finally {
            myChart.hideLoading();
        }
    },

    /**
     * 重新加载数据
     */
    reloadData: async function() {
        const $grid = $(`#${this.gridId}`);
        app.showLoading($grid);
        
        try {
            // 1. 获取列表数据
            const data = await mmsrv.server.traffic_stats.list();
            $grid.table('loadData', data);

            // 2. 获取汇总数据
            const summary = await mmsrv.server.traffic_stats.getSummary();
            $('#todayTraffic').text(this.formatBytes(summary.today_traffic));
            $('#totalTraffic').text(this.formatBytes(summary.total_traffic));

        } catch (e) {
            console.error('加载流量数据失败:', e);
        } finally {
            app.hideLoading($grid);
        }
    },

    /**
     * 格式化字节数为人类可读单位
     */
    formatBytes: function(bytes) {
        if (bytes === 0 || !bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};
