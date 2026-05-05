/**
 * 系统设置模块 (settings.js)
 */

const settings = {
    testTimer: null,
    historyData: [],
    originalConfig: {}, // 🚀 用于记录初始配置，实现按需提示
    
    init: async function () {
        this.renderLayout();
        this.reloadData();
    },

    renderLayout: function () {
        const html = `
            <div class="easyui-panel" data-options="fit:true, border:false" style="padding:15px; background:#f4f7f9;">
                <div style="max-width:800px; margin:0 auto; background:#fff; padding:20px; border:1px solid #d1d9e0; border-radius:6px;">
                    
                    <h3 style="color:#1a335d; border-left:4px solid #2a5298; padding-left:10px; margin-bottom:15px; font-size:16px;">系统核心配置</h3>
                    <form id="configForm">
                        <div style="margin-bottom:12px; display:flex; gap:20px;">
                            <div style="flex:1">
                                <label style="display:block; margin-bottom:5px; font-weight:bold; color:#444;">1. Web 管理服务端口 (Port)</label>
                                <input name="port" class="easyui-numberbox" data-options="required:true, min:1, max:65535" style="width:100%; height:32px">
                                <p style="color:#888; font-size:12px; margin-top:5px;">修改此端口会导致 Web 管理界面重启。</p>
                            </div>
                            <div style="flex:1">
                                <label style="display:block; margin-bottom:5px; font-weight:bold; color:#444;">2. NPC 通信端口 (NPC Port)</label>
                                <input name="npc_port" class="easyui-numberbox" data-options="required:true, min:1, max:65535" style="width:100%; height:32px">
                                <p style="color:#d43f3a; font-size:12px; font-weight:bold; margin-top:5px;">⚠️ 修改后请务必在服务器防火墙或云安全组中放行该端口。</p>
                            </div>
                        </div>
                        <div style="text-align:right; margin-bottom:20px;">
                            <a href="javascript:void(0)" class="easyui-linkbutton" data-options="iconCls:'icon-ok'" onclick="settings.saveConfig()" style="width:120px; height:32px">保存配置</a>
                        </div>
                    </form>

                    <h3 style="color:#1a335d; border-left:4px solid #2a5298; padding-left:10px; margin-bottom:15px; font-size:16px; margin-top:30px;">实时链路测速</h3>
                    
                    <div style="background:#fafafa; padding:15px; border:1px solid #ebebeb; border-radius:4px;">
                        <div style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:bold;">目标客户端:</span>
                            <select id="speedTestClient" class="easyui-combobox" style="width:200px; height:32px"></select>
                            <span style="font-weight:bold;">模式:</span>
                            <select id="speedTestMode" class="easyui-combobox" data-options="editable:false" style="width:90px; height:32px">
                                <option value="upload">上传</option>
                                <option value="download">下载</option>
                            </select>
                            <a href="javascript:void(0)" id="startBtn" class="easyui-linkbutton" data-options="iconCls:'icon-search'" onclick="settings.startSpeedTest()" style="height:32px; width:100px;">开始测试</a>
                        </div>
                        
                        <div style="position:relative; background:#1e1e2f; border-radius:4px; padding:10px; height:180px; overflow:hidden;">
                            <canvas id="speedChart" width="740" height="160" style="width:100%; height:100%;"></canvas>
                            <div id="realtimeSpeed" style="position:absolute; top:10px; right:20px; color:#00ff00; font-family:monospace; font-size:24px; font-weight:bold; text-shadow:0 0 5px #000;">0.00 Mbps</div>
                            <div id="testStatusLabel" style="position:absolute; top:10px; left:20px; color:#aaa; font-size:12px;">等待开始...</div>
                        </div>

                        <div style="color:#666; font-size:12px; margin-top:10px; padding:8px; border-left:4px solid #2a5298; background:#fff;">
                            测试说明：系统将进行为期 10 秒的饱和压力测试，曲线展示了实时吞吐波形。
                        </div>
                    </div>
                </div>
            </div>
        `;
        const $target = $(this.targetContainer || '#contentFrame');
        $target.html(html);
        $.parser.parse($target);
        this.initChart();
    },

    initChart: function() {
        const canvas = document.getElementById('speedChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        this.historyData = new Array(60).fill(0);
        this.drawChart(ctx);
    },

    drawChart: function(ctx) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        ctx.clearRect(0, 0, width, height);

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = height - (i * height / 4);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = width / (this.historyData.length - 1);
        const maxVal = Math.max(...this.historyData, 10);
        
        this.historyData.forEach((val, i) => {
            const x = i * step;
            const y = height - (val / (maxVal * 1.2)) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.lineTo(width, height); ctx.lineTo(0, height);
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 255, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
    },

    startSpeedTest: async function() {
        const clientId = $('#speedTestClient').combobox('getValue');
        const mode = $('#speedTestMode').combobox('getValue');
        if (!clientId) return $.messager.alert('提示', '请选择客户端');

        $('#startBtn').linkbutton('disable');
        $('#testStatusLabel').text('正在初始化数据链路...');
        this.historyData.fill(0);
        
        try {
            const res = await mmsrv.server.settings.startTestSpeed({ clientId: parseInt(clientId), mode });
            if (res.success) {
                this.pollStatus(res.sessionId);
            } else {
                $.messager.alert('错误', res.error, 'error');
                $('#startBtn').linkbutton('enable');
            }
        } catch (e) {
            $('#startBtn').linkbutton('enable');
        }
    },

    pollStatus: function(sessionId) {
        const self = this;
        const ctx = document.getElementById('speedChart').getContext('2d');
        this.testTimer = setInterval(async () => {
            try {
                const res = await mmsrv.server.settings.getTestStatus(sessionId);
                if (res.success) {
                    const data = res.data;
                    $('#realtimeSpeed').text(data.currentMbps.toFixed(2) + ' Mbps');
                    $('#testStatusLabel').text(data.finished ? '测试完成' : '正在压力测试...');
                    self.historyData.push(data.currentMbps);
                    if (self.historyData.length > 60) self.historyData.shift();
                    self.drawChart(ctx);
                    if (data.finished) {
                        clearInterval(self.testTimer);
                        $('#startBtn').linkbutton('enable');
                        if (data.error) $.messager.alert('测试中断', data.error, 'warning');
                        else $('#realtimeSpeed').html('<span style="font-size:14px;color:#aaa">平均: </span>' + data.finalMbps.toFixed(2) + ' Mbps');
                    }
                }
            } catch (e) {
                clearInterval(self.testTimer);
                $('#startBtn').linkbutton('enable');
            }
        }, 500);
    },

    reloadData: async function() {
        try {
            const resCfg = await mmsrv.server.settings.getConfig();
            if (resCfg.success) {
                this.originalConfig = resCfg.data;
                $('#configForm').form('load', resCfg.data);
            }

            const resCli = await mmsrv.server.npc_client.list();
            const rows = Array.isArray(resCli) ? resCli : (resCli && resCli.rows ? resCli.rows : []);
            const displayData = rows.map(c => ({
                id: c.id,
                text: `${c.client_name} ${c.status == 1 ? '(在线)' : '(离线)'}`,
                is_online: c.status == 1
            }));
            $('#speedTestClient').combobox({
                valueField: 'id', textField: 'text', data: displayData,
                onLoadSuccess: function() {
                    const online = displayData.find(d => d.is_online);
                    if (online) $(this).combobox('setValue', online.id);
                }
            });
        } catch (e) {}
    },

    saveConfig: function() {
        const port = parseInt($('input[name="port"]').val());
        const npc_port = parseInt($('input[name="npc_port"]').val());
        const data = { port, npc_port };

        // 🚀 核心改进：按需且清晰的提示
        const isPortChanged = (port !== this.originalConfig.port);
        const confirmMsg = isPortChanged 
            ? '<b>检测到 Web 管理服务端口已修改。</b><br><br>保存后 Web 应用将自动重启，您需要手动刷新浏览器页面以重新载入管理界面。确定要保存并重启吗？'
            : '确定要保存当前的系统配置吗？';

        $.messager.confirm('保存确认', confirmMsg, async (r) => {
            if (r) {
                app.showLoading('#contentFrame', '应用配置中...');
                try {
                    const res = await mmsrv.server.settings.saveConfig(data);
                    if (res.success) {
                        $.messager.alert('成功', res.msg, 'info', () => {
                            if (isPortChanged) {
                                // 如果修改了端口，提示用户后刷新可能失效（因为端口变了），引导其手动刷新
                                location.reload();
                            } else {
                                location.reload();
                            }
                        });
                    } else {
                        $.messager.alert('失败', res.error, 'error');
                        app.hideLoading('#contentFrame');
                    }
                } catch (e) {
                    app.hideLoading('#contentFrame');
                }
            }
        });
    }
};
