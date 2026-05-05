/**
 * 用户模块 - 处理登录、登出、状态检查等功能
 */
const User = {
    data: null, // 内存中保存的用户信息

    /**
     * 用户登录
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Object} 用户信息
     */
    async login(username, password) {
        const result = await mmsrv.server.user.login(username, password);

        if (result.success === false) {
            throw new Error(result.error || '登录失败');
        }

        this.data = result;
        return result;
    },

    /**
     * 从 Cookie 中解析用户数据（支持加密与非加密模式）
     * @returns {Object|null} 用户数据对象或 null
     */
    getUserData() {
        const match = document.cookie.match(/(?:^|;\s*)xnps_user=([^;]+)/);
        const cookieValue = match ? match[1] : null;
        if (!cookieValue) return null;

        const key = mmsrv.encryptionKey;
        try {
            if (key) {
                // 加密模式：AES 解密
                const ciphertext = cookieValue.slice(0, -key.length);
                const bytes = CryptoJS.AES.decrypt(ciphertext, key);
                const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
                return decryptedStr ? JSON.parse(decryptedStr) : null;
            } else {
                // 非加密模式：Base64 解码
                return JSON.parse(atob(cookieValue));
            }
        } catch (e) {
            console.error('Parse user cookie error:', e);
            return null;
        }
    },

    /**
     * 检查登录状态
     * @returns {boolean} 是否已登录
     */
    async checkLogin() {
        try {
            const userData = this.getUserData();
            if (!userData || !userData.token) {
                return false;
            }

            // 调用后端验证 token 有效性
            const valid = await mmsrv.server.user.validateToken(userData.token);
            if (valid) {
                this.data = userData;
            }
            return valid;
        } catch (e) {
            console.error('Check login error:', e);
            return false;
        }
    },

    /**
     * 用户登出
     */
    async logout() {
        this.data = null;
        // 清除 Cookie
        document.cookie = 'xnps_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC';
        await mmsrv.server.user.logout();
    },

    /**
     * 处理登出逻辑（带确认）
     */
    async handleLogout() {
        $.messager.confirm('确认', '确定要退出登录吗？', async (r) => {
            if (r) {
                await this.logout();
                this.showLoginDialog(async () => {
                    if (typeof app !== 'undefined' && app.showMain) {
                        await app.showMain();
                    }
                });
            }
        });
    },

    /**
     * 获取当前登录数据
     * @returns {Object|null}
     */
    getLoginData() {
        return this.data;
    },

    /**
     * 修改密码
     * @param {string} oldPassword 
     * @param {string} newPassword 
     */
    async updatePassword(oldPassword, newPassword) {
        const result = await mmsrv.server.user.updatePassword(oldPassword, newPassword);
        if (result.success === false) {
            throw new Error(result.error || '修改密码失败');
        }
        return result;
    },

    /**
     * 显示登录对话框
     * @param {Function} onSuccess - 登录成功回调
     */
    showLoginDialog(onSuccess) {
        let $dialog = $('#loginDialog');

        if (!$dialog.length) {
            const loginHtml = `
                <div id="loginDialog" class="login-dialog" style="display:none; overflow:hidden">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <h2 style="color: #1e3c72; margin: 0;">NPS 内网穿透</h2>
                        <p style="color: #999; margin-top: 5px;">管理系统登录</p>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label class="label">用户名</label>
                        <input id="username" type="text" style="width:100%; height:38px;" />
                    </div>
                    <div style="margin-bottom: 25px;">
                        <label class="label">密码</label>
                        <input id="password" type="password" style="width:100%; height:38px;" />
                    </div>
                </div>
            `;
            $('body').append(loginHtml);
            $dialog = $('#loginDialog');

            $('#username').textbox({
                prompt: '请输入用户名',
                iconCls: 'icon-man',
                iconWidth: 38
            });
            $('#password').passwordbox({
                prompt: '请输入密码',
                iconCls: 'icon-lock',
                iconWidth: 38
            });
        }

        $dialog.dialog({
            title: '安全登录',
            width: 400,
            height: 380,
            closed: false,
            cache: false,
            modal: true,
            border: 'thin',
            cls: 'c1',
            buttons: [{
                text: '登 录',
                id: 'loginBtn',
                width: 100,
                height: 36,
                handler: async () => {
                    const username = $('#username').textbox('getValue');
                    const password = $('#password').passwordbox('getValue');

                    if (!username || !password) {
                        $.messager.show({ title: '提示', msg: '请输入用户名和密码' });
                        return;
                    }

                    $('#loginBtn').linkbutton('disable').linkbutton({ text: '登录中...' });

                    try {
                        await this.login(username, password);
                        $dialog.dialog('close');
                        if (typeof onSuccess === 'function') {
                            await onSuccess();
                        }
                    } catch (e) {
                        $.messager.alert('登录失败', e.message, 'error');
                    } finally {
                        $('#loginBtn').linkbutton({ text: '登 录' }).linkbutton('enable');
                    }
                }
            }]
        });
    },

    /**
     * 显示修改帐号（密码）对话框
     */
    showAccountDialog() {
        let $dialog = $('#accountDialog');

        if (!$dialog.length) {
            const dialogHtml = `
                <div id="accountDialog" style="padding: 25px; display:none; overflow:hidden">
                    <div style="margin-bottom: 15px;">
                        <label class="label">当前密码</label>
                        <input id="oldPassword" type="password" style="width:100%; height:32px;" />
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label class="label">新密码</label>
                        <input id="newPassword" type="password" style="width:100%; height:32px;" />
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label class="label">确认新密码</label>
                        <input id="confirmPassword" type="password" style="width:100%; height:32px;" />
                    </div>
                </div>
            `;
            $('body').append(dialogHtml);
            $dialog = $('#accountDialog');

            $('#oldPassword').passwordbox({ prompt: '输入当前密码' });
            $('#newPassword').passwordbox({ prompt: '输入新密码' });
            $('#confirmPassword').passwordbox({ prompt: '再次输入新密码' });
        }

        $dialog.dialog({
            title: '修改帐号密码',
            width: 350,
            height: 320,
            modal: true,
            closed: false,
            buttons: [{
                text: '保存修改',
                id: 'saveAccountBtn',
                iconCls: 'icon-ok',
                handler: async () => {
                    const oldPass = $('#oldPassword').passwordbox('getValue');
                    const newPass = $('#newPassword').passwordbox('getValue');
                    const confPass = $('#confirmPassword').passwordbox('getValue');

                    if (!oldPass || !newPass) {
                        $.messager.alert('提示', '请填写完整信息');
                        return;
                    }

                    if (newPass !== confPass) {
                        $.messager.alert('提示', '两次输入的新密码不一致');
                        return;
                    }

                    $('#saveAccountBtn').linkbutton('disable').linkbutton({ text: '保存中...' });

                    try {
                        await this.updatePassword(oldPass, newPass);
                        $.messager.show({ title: '成功', msg: '密码修改成功' });
                        $dialog.dialog('close');
                    } catch (e) {
                        $.messager.alert('错误', e.message, 'error');
                    } finally {
                        $('#saveAccountBtn').linkbutton({ text: '保存修改' }).linkbutton('enable');
                    }
                }
            }, {
                text: '取消',
                handler: () => $dialog.dialog('close')
            }]
        });
    }
};
