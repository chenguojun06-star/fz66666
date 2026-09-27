const i18n = require('../../utils/i18n/index');
const NS = 'mp.register.';
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
    agreedPolicies: true,
    loading: false,
    factorySearch: '',
    tenants: [],
    filteredTenants: [],
    selectedFactory: null,
    showFactoryDropdown: false,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        navTitle: i18n.t(NS + 'navTitle', lang),
        subtitle: i18n.t(NS + 'subtitle', lang),
        factoryCodeLabel: i18n.t(NS + 'factoryCodeLabel', lang),
        factoryNotFound: i18n.t(NS + 'factoryNotFound', lang),
        usernameLabel: i18n.t(NS + 'usernameLabel', lang),
        nameLabel: i18n.t(NS + 'nameLabel', lang),
        phoneLabel: i18n.t(NS + 'phoneLabel', lang),
        passwordLabel: i18n.t(NS + 'passwordLabel', lang),
        confirmPwdLabel: i18n.t(NS + 'confirmPwdLabel', lang),
        agreePrefix: i18n.t(NS + 'agreePrefix', lang),
        termsLink: i18n.t(NS + 'termsLink', lang),
        andWord: i18n.t(NS + 'andWord', lang),
        privacyLink: i18n.t(NS + 'privacyLink', lang),
        hasAccount: i18n.t(NS + 'hasAccount', lang),
        backLoginBtn: i18n.t(NS + 'backLoginBtn', lang),
        submitBtn: i18n.t(NS + 'submitBtn', lang),
        codeLabel2: i18n.t(NS + 'codeLabel2', lang),
        codeOrNamePh: i18n.t(NS + 'codeOrNamePh', lang),
        usernamePh: i18n.t(NS + 'usernamePh', lang),
        namePh: i18n.t(NS + 'namePh', lang),
        phonePh: i18n.t(NS + 'phonePh', lang),
        pwdPh: i18n.t(NS + 'pwdPh', lang),
        confirmPwdPh: i18n.t(NS + 'confirmPwdPh', lang),
        submittingW: i18n.t(NS + 'submittingW', lang),
        submitRegBtn: i18n.t(NS + 'submitRegBtn', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    if (options && options.tenantCode) {
      this.setData({
        tenantCode: decodeURIComponent(options.tenantCode),
        tenantName: options.tenantName ? decodeURIComponent(options.tenantName) : '',
        scannedCode: true,
        selectedFactory: {
          tenantCode: decodeURIComponent(options.tenantCode),
          tenantName: options.tenantName ? decodeURIComponent(options.tenantName) : '',
        },
      });
    }
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
    this._loadTenants();
  },

  _loadTenants() {
    api.tenant.publicList().then((res) => {
      let list = [];
      if (res && res.data && Array.isArray(res.data)) {
        list = res.data;
      } else if (Array.isArray(res)) {
        list = res;
      }
      this.setData({ tenants: list });
    }).catch(function() {});
  },

  onUnload() {
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },

  // ========== 输入事件 ==========
  onTenantCodeInput(e) {
    const val = (e && e.detail && e.detail.value) || '';
    this.setData({ tenantCode: val, selectedFactory: null, factorySearch: val });
    this._filterTenants(val);
  },

  _filterTenants(keyword) {
    if (!keyword || !keyword.trim()) {
      this.setData({ filteredTenants: [], showFactoryDropdown: false });
      return;
    }
    const kw = keyword.trim().toLowerCase();
    const tenants = this.data.tenants;
    const filtered = tenants.filter(function(t) {
      const tName = (t.tenantName || t.name || '').toLowerCase();
      const tCode = (t.tenantCode || '').toLowerCase();
      return tName.indexOf(kw) !== -1 || tCode.indexOf(kw) !== -1;
    });
    this.setData({
      filteredTenants: filtered.slice(0, 20),
      showFactoryDropdown: filtered.length > 0,
    });
  },

  onPickFactory(e) {
    const idx = e.currentTarget.dataset.index;
    const factory = this.data.filteredTenants[idx];
    if (!factory) return;
    this.setData({
      tenantCode: factory.tenantCode || '',
      tenantName: factory.tenantName || factory.name || '',
      factoryId: factory.id || '',
      factorySearch: factory.tenantCode || '',
      selectedFactory: factory,
      filteredTenants: [],
      showFactoryDropdown: false,
      scannedCode: false,
    });
  },

  onHideFactoryDropdown() {
    this.setData({ showFactoryDropdown: false });
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
  onAgreePoliciesChange(e) {
    if (e && e.detail && typeof e.detail.value !== 'undefined') {
      this.setData({ agreedPolicies: !!e.detail.value });
    } else {
      this.setData({ agreedPolicies: !this.data.agreedPolicies });
    }
  },
  onViewServiceAgreement() {
    safeNavigate({ url: '/pages/privacy/service/index' }).catch(() => {});
  },
  onViewPrivacyPolicy() {
    safeNavigate({ url: '/pages/privacy/index' }).catch(() => {});
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
            selectedFactory: {
              tenantCode: parsed.tenantCode,
              tenantName: parsed.factoryName || parsed.tenantName || '',
              id: parsed.factoryId || '',
            },
            filteredTenants: [],
            showFactoryDropdown: false,
          });
          toast.success(i18n.t(NS + 'scanOkPrefix', this._lang) + (parsed.factoryName || parsed.tenantName || parsed.tenantCode));
        } else {
          this.setData({
            tenantCode: result.trim(),
            scannedCode: true,
            selectedFactory: null,
            filteredTenants: [],
            showFactoryDropdown: false,
          });
          toast.success(i18n.t(NS + 'codeObtained', this._lang));
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
    const { tenantCode, username, name, phone, password, confirmPassword, agreedPolicies } = this.data;

    if (!tenantCode.trim()) {
      toast.error(i18n.t(NS + 'factoryCodeReq', this._lang));
      return false;
    }

    const usernameErr = validateByRule(username, {
      name: i18n.t(NS + 'usernameLabel', this._lang),
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
      toast.error(i18n.t(NS + 'nameReq', this._lang));
      return false;
    }

    const phoneValue = String(phone || '').trim();
    if (phoneValue) {
      const phoneErr = validateByRule(phoneValue, {
        name: i18n.t(NS + 'phoneLabel', this._lang),
        required: false,
        pattern: /^1[3-9]\d{9}$/,
      });
      if (phoneErr) {
        toast.error(phoneErr);
        return false;
      }
    }

    const passwordErr = validateByRule(password, {
      name: i18n.t(NS + 'passwordLabel', this._lang),
      required: true,
      minLength: 6,
      maxLength: 20,
    });
    if (passwordErr) {
      toast.error(passwordErr);
      return false;
    }

    if (password !== confirmPassword) {
      toast.error(i18n.t(NS + 'pwdMismatch', this._lang));
      return false;
    }

    if (!agreedPolicies) {
      toast.error(i18n.t(NS + 'agreeRequired', this._lang));
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
        phone: (phone || '').trim() || undefined,
        password,
      });

      // resp 是 raw 返回（包含 code 字段）
      if (resp && resp.code === 200) {
        wx.showModal({
          title: i18n.t(NS + 'regOk', this._lang),
          content: i18n.t(NS + 'regPendingMsg', this._lang),
          showCancel: false,
          confirmText: i18n.t(NS + 'backLoginBtn', this._lang),
          success: () => {
            safeNavigate({ url: '/pages/login/index' }, 'redirectTo').catch(() => {});
          },
        });
      } else {
        toast.error((resp && resp.message) || i18n.t(NS + 'regFailRetry', this._lang));
      }
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || i18n.t(NS + 'regFailNetwork', this._lang);
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
