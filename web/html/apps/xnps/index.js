/**
 * NPS内网穿透管理系统 - 主框架入口
 */
const app = {
    user: null, // 全局用户实例

    // 🚀 初始化应用环境
    init: async function () {
        // 1. 加载核心类库
        await mmsrv.loadlib("easyui");
        await mmsrv.loadjs("/html/lib/crypto.js");
        await mmsrv.loadjs("/html/lib/mmsrv/jquery.table.js");
        await mmsrv.loadjs("/html/lib/echarts/echarts.min.js");

        // 2. 加载用户模块（本应用的user.js）
        await mmsrv.loadjs("/html/apps/xnps/user.js");

        $(async () => {
            // 3. 注入全局美化样式
            this.injectStyles();

            // 4. 执行登录校验
            this.user = User;
            const isLogin = await this.user.checkLogin();

            if (!isLogin) {
                this.user.showLoginDialog(async () => {
                    await this.showMain();
                });
            } else {
                await this.showMain();
            }
        });
    },

    /**
     * 注入全局美化样式
     */
    injectStyles: function () {
        const style = `
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; overflow: hidden; }
            ::-webkit-scrollbar { width: 0 !important; height: 0 !important; } /* 彻底隐藏 Chrome/Edge 滚动条 */
            .login-dialog { padding: 30px; background: #fff; }
            .login-dialog .label { display: block; margin-bottom: 8px; font-weight: 600; color: #444; }
            
            /* 顶部布局美化 */
            .layout-north { 
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                color: white; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                padding: 0 20px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            .header-left { display: flex; align-items: center; }
            .header-title { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
            .header-right { display: flex; align-items: center; gap: 15px; }
            
            .user-info { 
                display: flex; 
                align-items: center; 
                cursor: pointer; 
                padding: 5px 12px; 
                border-radius: 20px; 
                background: rgba(255,255,255,0.1);
                transition: background 0.3s;
            }
            .user-info:hover { background: rgba(255,255,255,0.2); }
            .user-avatar { 
                width: 32px; 
                height: 32px; 
                background: #fff; 
                color: #2a5298; 
                border-radius: 50%; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                margin-right: 10px;
                font-weight: bold;
            }
            
            .nav-btn {
                color: white;
                text-decoration: none;
                font-size: 14px;
                padding: 5px 10px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .nav-btn:hover { background: rgba(255,255,255,0.15); }
            
            /* 侧边栏美化 */
            .sidebar-menu { padding: 15px 0; }
            .sidebar-menu .tree-node { padding: 10px 15px; height: auto; border: none; }
            .sidebar-menu .tree-title { font-size: 14px; }
            .sidebar-menu .tree-node-selected { background: #e6f7ff; color: #1890ff; border-right: 3px solid #1890ff; }
            
            /* 内容区美化 */
            .content-panel { padding: 20px; background: #f0f2f5; }
            .welcome-card {
                background: white;
                padding: 50px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                max-width: 800px;
                margin: 40px auto;
            }
            /* 🚀 全局统一 Loading 样式 */
            .xnps-loading-mask {
                position: absolute;
                left: 0; top: 0; width: 100%; height: 100%;
                background: rgba(255, 255, 255, 0.6);
                z-index: 9000;
                backdrop-filter: blur(1px);
            }
            .xnps-loading-msg {
                position: absolute;
                z-index: 9001;
                background: #fff;
                border: 1px solid #ddd;
                padding: 12px 20px 12px 45px;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                color: #333;
                font-size: 13px;
                min-width: 160px;
                pointer-events: none;
            }
            .xnps-loading-icon {
                position: absolute;
                left: 15px; top: 50%;
                margin-top: -10px;
                width: 20px; height: 20px;
                border: 2px solid #eee;
                border-top-color: #1890ff;
                border-radius: 50%;
                animation: xnps-spin 0.8s linear infinite;
            }
            @keyframes xnps-spin {
                to { transform: rotate(360deg); }
            }
        `;
        const styleSheet = document.createElement('style');
        styleSheet.textContent = style;
        document.head.appendChild(styleSheet);
    },

    /**
     * 显示全局统一 Loading 遮罩
     */
    showLoading: function (target, msg = 'Processing, please wait ...') {
        const $target = $(target);
        this.hideLoading($target); // 先清理

        const $mask = $('<div class="xnps-loading-mask"></div>').appendTo($target);
        const $msg = $(`
            <div class="xnps-loading-msg">
                <div class="xnps-loading-icon"></div>
                <span>${msg}</span>
            </div>
        `).appendTo($target);

        $msg.css({
            left: '50%',
            top: '50%',
            marginLeft: -($msg.outerWidth() / 2) + 'px',
            marginTop: -($msg.outerHeight() / 2) + 'px'
        });
    },

    /**
     * 隐藏全局统一 Loading 遮罩
     */
    hideLoading: function (target) {
        $(target).find('.xnps-loading-mask, .xnps-loading-msg').remove();
    },

    /**
     * 展现主界面 Layout
     */
    showMain: async function () {
        const userInfo = this.user.getLoginData() || { username: 'Admin' };
        const avatarChar = userInfo.username.charAt(0).toUpperCase();

        const mainHtml = `
            <div id="mainLayout" style="width:100%;height:100%;">
                <div data-options="region:'north',border:false" class="layout-north" style="height:64px;">
                    <div class="header-left">
                        <div class="header-title">NPS 内网穿透管理系统</div>
                    </div>
                    <div class="header-right">
                        <div class="user-info" id="userProfileBtn">
                            <div class="user-avatar">${avatarChar}</div>
                            <span>${userInfo.username}</span>
                        </div>
                        <a href="javascript:void(0)" class="nav-btn" onclick="User.handleLogout()"><i class="fa fa-sign-out"></i> 退出登录</a>
                    </div>
                </div>
                <div data-options="region:'west',title:'导航菜单',split:true" style="width:220px; background:#fff;">
                    <ul id="sidebarMenu" class="sidebar-menu"></ul>
                </div>
                <div data-options="region:'center',border:false">
                    <div id="contentFrame" style="width:100%; height:100%; overflow:auto; background:#f0f2f5;"></div>
                </div>
            </div>
            
            <!-- 用户下拉菜单 -->
            <div id="userMenu" class="easyui-menu" style="width:150px;">
                <div data-options="iconCls:'icon-edit'" onclick="User.showAccountDialog()">修改帐号</div>
                <div class="menu-sep"></div>
                <div data-options="iconCls:'icon-no'" onclick="User.handleLogout()">退出登录</div>
            </div>
        `;

        $('body').html(mainHtml);

        // 🚀 核心修复：显式初始化菜单组件，防止 EasyUI 报错
        $('#userMenu').menu();

        $('#mainLayout').layout({
            fit: true
        });

        // 初始化用户下拉菜单触发
        $('#userProfileBtn').on('click', function (e) {
            const $this = $(this);
            const offset = $this.offset();
            $('#userMenu').menu('show', {
                left: offset.left,
                top: offset.top + $this.outerHeight()
            });
        });

        // 加载侧边栏菜单
        this.loadSidebar();

        // 显示欢迎信息
        this.showWelcome();
    },

    /**
     * 加载侧边栏菜单
     */
    loadSidebar: function () {
        const menuData = [
            { id: 'port_mapping', text: '端口映射', iconCls: 'icon-grid' },
            { id: 'npc_client', text: '客户端管理', iconCls: 'icon-computer' },
            { id: 'access_log', text: '访问日志', iconCls: 'icon-file-text' },
            { id: 'traffic_stats', text: '流量统计', iconCls: 'icon-bar-chart' },
            { id: 'settings', text: '系统设置', iconCls: 'icon-settings' }
        ];

        $('#sidebarMenu').tree({
            data: menuData,
            onClick: async (node) => {
                if (!node.id) return;

                const moduleName = node.id;
                const containerId = `page-${moduleName}`;

                // 1. 隐藏所有页面容器
                $('#contentFrame > div').hide();

                // 2. 检查该页面容器是否已存在
                let $container = $(`#${containerId}`);
                if ($container.length === 0) {
                    // 3. 第一次加载：创建容器并初始化
                    $container = $(`<div id="${containerId}" style="width:100%; height:100%;"></div>`).appendTo('#contentFrame');
                    app.showLoading($container, '正在载入模块...');

                    try {
                        let module = null;
                        try { module = eval(moduleName); } catch (e) { }

                        if (!module) {
                            await mmsrv.loadjs(`/html/apps/xnps/${moduleName}.js`);
                            module = eval(moduleName);
                        }

                        if (module && typeof module.init === 'function') {
                            // 🚀 核心优化：传入容器 ID，让模块知道渲染到哪里
                            module.targetContainer = `#${containerId}`;
                            await module.init();
                        }
                    } catch (e) {
                        $container.html(`<div style="padding:40px; color:red;">加载失败: ${e.message}</div>`);
                    } finally {
                        app.hideLoading($container);
                    }
                } else {
                    // 4. 非第一次加载：直接显示并刷新数据
                    $container.show();
                    const module = eval(moduleName);
                    if (module && typeof module.reloadData === 'function') {
                        module.reloadData();
                    }
                }
            }
        });
    },

    /**
     * 显示欢迎信息
     */
    showWelcome: function () {
        const userInfo = this.user.getLoginData();
        const welcomeHtml = `
            <div id="page-welcome" style="width:100%; height:100%;">
                <div class="welcome-card">
                    <h2 style="color: #1e3c72; margin-bottom: 20px;">欢迎回来，${userInfo?.username || '管理员'}</h2>
                    <p style="font-size: 16px; color: #666; line-height: 1.6;">
                        NPS 内网穿透管理系统为您提供稳定、高效的穿透服务管理。<br>
                        您可以通过左侧菜单管理您的 NPC 客户端和端口映射规则。
                    </p>
                </div>
            </div>
        `;
        $('#contentFrame').html(welcomeHtml);
    }
};

// 启动应用
app.init();
