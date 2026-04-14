const api = require('../../utils/api');
const { validateByRule } = require('../../utils/validationRules');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { eventBus } = require('../../utils/eventBus');

/**
 * 员工注册页面
 * 支持手动输入工厂编码或扫码获取
 */
Page({
  data: {
    tenantCode: '',
    tenantName: '',
    factoryId: '',
    scannedCode: false,
    username: '',
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    loading: false,
  },

  onLoad(options) {
    // 从页面参数中获取工厂编码（扫码跳转时传入）
    if (options && options.tenantCode) {
      this.setData({
        tenantCode: decodeURIComponent(options.tenantCode),
        tenantName: options.tenantName ? decodeURIComponent(options.tenantName) : '',
        scannedCode: true,
      });
    }
    // 订阅隐私授权弹窗事件（微信审核必须：扫码前须获得授权）
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', resolve => {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') {
            dialog.showDialog(resolve);
          }
        } catch (_) { /* 静默忽略 */ }
      });
    }
  },

  onUnload() {
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },

  // ========== 输入事件 ==========
  onTenantCodeInput(e) {
    this.setData({ tenantCode: (e && e.detail && e.detail.value) || '' });
  },
  onUsernameInput(e) {
    this.setData({ username: (e && e.detail && e.detail.value) || '' });
  },
  onNameInput(e) {
    this.setData({ name: (e && e.detail && e.detail.value) || '' });
  },
  onPhoneInput(e) {
    this.setData({ phone: (e && e.detail && e.detail.value) || '' });
  },
  onPasswordInput(e) {
    this.setData({ password: (e && e.detail && e.detail.value) || '' });
  },
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: (e && e.detail && e.detail.value) || '' });
  },

  // ========== 扫码获取工厂编码 ==========
  onScanCode() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const result = res.result || '';
        // 尝试从注册链接中解析 tenantCode
        const parsed = this._parseTenantCode(result);
        if (parsed.tenantCode) {
          this.setData({
            tenantCode: parsed.tenantCode,
            tenantName: parsed.factoryName || parsed.tenantName || '',
            factoryId: parsed.factoryId || '',
            scannedCode: true,
          });
          toast.success('扫码成功：' + (parsed.factoryName || parsed.tenantName || parsed.tenantCode));
        } else {
          // 直接把扫到的内容作为工厂编码
          this.setData({
            tenantCode: result.trim(),
            scannedCode: true,
          });
          toast.success('已获取编码');
        }
      },
      fail: () => {
        // 用户取消扫码，不提示错误
      },
    });
  },

  /**
   * 解析二维码内容，提取 tenantCode 、 tenantName 和 factoryId
   * 支持格式：
   * 1. JSON 格式 (FACTORY_INVITE): {"type":"FACTORY_INVITE","tenantCode":"T001","factoryId":"123","factoryName":"工厂名"}
   * 2. URL 带参数：https://xxx/register?tenantCode=HUANAN&tenantName=华南服装厂
   * 3. 纯编码文本：HUANAN
   */
  _parseTenantCode(text) {
    const result = { tenantCode: '', tenantName: '', factoryId: '', factoryName: '' };
    if (!text) return result;

    // 尝试 JSON 格式（外发工厂扫码注册二维码）
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.type === 'FACTORY_INVITE' && parsed.tenantCode) {
        result.tenantCode = parsed.tenantCode;
        result.factoryId = parsed.factoryId || '';
        result.factoryName = parsed.factoryName || '';
        return result;
      }
    } catch (_e) {
      // 不是 JSON，继续尝试 URL 格式
    }

    try {
      // 尝试解析为 URL
      if (text.indexOf('tenantCode=') !== -1) {
        const match = text.match(/[?&]tenantCode=([^&]+)/);
        if (match) {
          result.tenantCode = decodeURIComponent(match[1]);
        }
        const nameMatch = text.match(/[?&]tenantName=([^&]+)/);
        if (nameMatch) {
          result.tenantName = decodeURIComponent(nameMatch[1]);
        }
        const factoryIdMatch = text.match(/[?&]factoryId=([^&]+)/);
        if (factoryIdMatch) {
          result.factoryId = decodeURIComponent(factoryIdMatch[1]);
        }
        const factoryNameMatch = text.match(/[?&]factoryName=([^&]+)/);
        if (factoryNameMatch) {
          result.factoryName = decodeURIComponent(factoryNameMatch[1]);
        }
      }
    } catch (_e) {
      // 解析失败，返回空
    }

    return result;
  },

  // ========== 表单验证 ==========
  _validate() {
    const { tenantCode, username, name, phone, password, confirmPassword } = this.data;

    if (!tenantCode.trim()) {
      toast.error('请输入工厂编码');
      return false;
    }

    const usernameErr = validateByRule(username, {
      name: '用户名',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_]+$/,
    });
    if (usernameErr) {
      toast.error(usernameErr);
      return false;
    }

    if (!name.trim()) {
      toast.error('请输入真实姓名');
      return false;
    }

    const phoneErr = validateByRule(phone, {
      name: '手机号',
      required: true,
      pattern: /^1[3-9]\d{9}$/,
    });
    if (phoneErr) {
      toast.error(phoneErr);
      return false;
    }

    const passwordErr = validateByRule(password, {
      name: '密码',
      required: true,
      minLength: 6,
      maxLength: 20,
    });
    if (passwordErr) {
      toast.error(passwordErr);
      return false;
    }

    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return false;
    }

    return true;
  },

  // ========== 提交注册 ==========
  async onSubmit() {
    if (this.data.loading) return;
    if (!this._validate()) return;

    this.setData({ loading: true });
    try {
      const { tenantCode, factoryId, orgUnitId, tenantName, username, name, phone, password } = this.data;
      const resp = await api.tenant.workerRegister({
        tenantCode: tenantCode.trim(),
        factoryId: factoryId || undefined,
        orgUnitId: orgUnitId || undefined,
        factoryName: tenantName || undefined,
        username: username.trim(),
        name: name.trim(),
        phone: phone.trim(),
        password,
      });

      // resp 是 raw 返回（包含 code 字段）
      if (resp && resp.code === 200) {
        wx.showModal({
          title: '注册成功',
          content: '注册申请已提交，请耐心等待管理员审批通过后即可登录。',
          showCancel: false,
          confirmText: '返回登录',
          success: () => {
            safeNavigate({ url: '/pages/login/index' }, 'redirectTo').catch(() => {});
          },
        });
      } else {
        toast.error((resp && resp.message) || '注册失败，请稍后重试');
      }
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || '注册失败，请检查网络';
      toast.error(msg);
    } finally {
      this.setData({ loading: false });
    }
  },

  // ========== 返回登录 ==========
  onBackToLogin() {
    safeNavigate({ url: '/pages/login/index' }, 'redirectTo').catch(() => {});
  },
});
