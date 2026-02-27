const { getToken, setToken, setUserInfo } = require('../../utils/storage');
const { getBaseUrl, setBaseUrl, normalizeBaseUrl } = require('../../config');
const api = require('../../utils/api');
const i18n = require('../../utils/i18n/index');
const { validateByRule } = require('../../utils/validationRules');
const { toast, safeNavigate } = require('../../utils/uiHelper');

let autoWechatTried = false;

/** 租户列表缓存 */
let cachedTenants = [];

/**
 * 静默尝试微信一键登录（无需选公司）
 * 如果 openid 已绑定：直接登录跳转首页
 * 如果 openid 未绑定：返回 false，展示公司+账号表单
 * @returns {Promise<boolean>} 是否登录成功
 */
async function tryAutoWechatLogin() {
  const envVersion = resolveEnvVersion();
  if (envVersion === 'develop') return false;
  try {
    const code = await resolveLoginCode();
    if (!code || code.startsWith('mock_')) return false;
    const resp = await api.wechat.miniProgramLogin({ code });
    if (resp && resp.code === 200 && resp.data && resp.data.token) {
      setToken(resp.data.token);
      if (resp.data.user) setUserInfo(resp.data.user);
      safeNavigate({ url: '/pages/home/index' }, 'switchTab').catch(() => {});
      return true;
    }
    // needBind=true 是预期内结果，不是错误
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * 验证用户名（3-20位，仅允许字母数字下划线短横线）
 * @param {string} username - 用户名
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validateUsername(username) {
  return (
    validateByRule(username, {
      name: '账号',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_-]+$/,
    }) || ''
  );
}

/**
 * 验证密码（6-20位）
 * @param {string} password - 密码
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validatePassword(password) {
  return (
    validateByRule(password, { name: '密码', required: true, minLength: 6, maxLength: 20 }) || ''
  );
}

/**
 * 验证 API 基地址格式（可选）
 * @param {string} url - API 地址
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validateApiBaseUrl(url) {
  const v = String(url || '').trim();
  if (!v) {
    return '';
  } // 可选字段
  const error = validateByRule(v, { name: 'API 地址', required: false, pattern: /^https?:\/\// });
  if (error) {
    return error;
  }
  return '';
}

/**
 * 获取小程序 AppID
 * @returns {string} AppID 或空字符串
 */
function resolveAppId() {
  try {
    if (wx && typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      const mp = info && info.miniProgram;
      return mp && mp.appId ? String(mp.appId) : '';
    }
  } catch (_e) {
    // 忽略 AppID 获取失败
  }
  return '';
}

/**
 * 获取微信登录 code
 * @returns {Promise<string>} 登录 code
 */
async function resolveLoginCode() {
  const appId = resolveAppId();
  const envVersion = resolveEnvVersion();

  // 开发环境或无效 AppID，使用 Mock 模式（跳过微信登录）
  if (!appId || appId === 'touristappid' || envVersion === 'develop') {
    console.log('[Login] 开发环境，使用 Mock 模式跳过微信登录');
    return 'mock_dev';
  }

  // 生产环境才调用真实 wx.login()
  try {
    const loginRes = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject,
        timeout: 5000, // 5秒超时
      });
    });
    return loginRes && loginRes.code ? String(loginRes.code) : '';
  } catch (err) {
    console.error('[Login] wx.login() 失败:', err);
    // 如果微信登录失败，降级到 Mock 模式
    return 'mock_dev';
  }
}

/**
 * 获取小程序环境版本（develop/trial/release）
 * @returns {string} 环境版本
 */
function resolveEnvVersion() {
  try {
    if (wx && typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      const mp = info && info.miniProgram;
      const v = mp && mp.envVersion ? String(mp.envVersion) : '';
      return v || 'develop';
    }
  } catch (_e) {
    // 忽略环境版本获取失败
  }
  return 'develop';
}

/**
 * 执行登录（通用函数 - 消除重复代码）
 * @param {Object} params - 登录参数 { code, username?, password? }
 * @param {Object} options - 选项 { silent: bool }  silent=true 时 needBind 不弹错误
 * @returns {Promise<{success:bool, needBind?:bool}>}
 */
async function executeLogin(params, options = {}) {
  const silent = options.silent === true;
  try {
    const resp = await api.wechat.miniProgramLogin(params);

    // ✅ openid 已绑定 → 拿到 token，直接登录
    if (resp && resp.code === 200 && resp.data && resp.data.token) {
      // 登录前清除旧用户的业务缓存，防止跨租户数据泄漏
      const OLD_DATA_KEYS = [
        'pending_cutting_task',
        'pending_procurement_task',
        'pending_quality_task',
        'pending_order_hint',
        'highlight_order_no',
        'mp_scan_type_index',
        'work_active_tab',
        'scan_history_v2',
        'pending_reminders',
      ];
      OLD_DATA_KEYS.forEach(key => {
        try { wx.removeStorageSync(key); } catch (_) { /* ignore */ }
      });

      setToken(resp.data.token);
      if (resp.data.user) {
        setUserInfo(resp.data.user);
      }
      safeNavigate({ url: '/pages/home/index' }, 'switchTab').catch(() => {});
      return { success: true };
    }

    // ✅ openid 未绑定 → 需要用户输入账号密码绑定（首次）
    if (resp && resp.code === 200 && resp.data && resp.data.needBind) {
      if (!silent) {
        toast.info(i18n.t('login.inputAccountToBind'));
      }
      return { success: false, needBind: true };
    }

    // ❌ 真正的错误（账号密码错误、网络异常等）
    toast.error((resp && resp.message) || i18n.t('login.loginFailed'));
    return { success: false };
  } catch (e) {
    const app = getApp();
    if (app && typeof app.toastError === 'function') {
      app.toastError(e, i18n.t('login.networkError'));
    } else {
      toast.error(i18n.t('login.networkError'));
    }
    return { success: false };
  }
}

/**
 * 验证并设置 API 地址（通用函数）
 * @param {string} apiBaseUrl - API 地址
 * @returns {string|null} 错误信息或 null
 */
function validateAndSetBaseUrl(apiBaseUrl) {
  if (apiBaseUrl) {
    const err = validateApiBaseUrl(apiBaseUrl);
    if (err) {
      return err;
    }
    setBaseUrl(apiBaseUrl);
  }
  return null;
}

Page({
  data: {
    currentLanguage: 'zh-CN',
    currentLanguageLabel: '中文',
    languageSwitchText: '语言',
    languageNameMap: {
      'zh-CN': '中文',
      'en-US': 'English',
      'vi-VN': 'Tiếng Việt',
      'km-KH': 'ខ្មែរ',
    },
    username: '',
    password: '',
    apiBaseUrl: '',
    loading: false,
    envVersion: '',
    showDevFields: false,
    // 租户搜索
    tenants: [],
    tenantSearchText: '',
    filteredTenants: [],
    showTenantResults: false,
    selectedTenantId: null,
    selectedTenantName: '',
    tenantsLoading: true,
    showPassword: false,
    // 是否正在尝试微信快速登录（验证 openid 绑定状态中）
    wechatChecking: false,
    // 邀请模式：管理员扫码邀请员工时显示
    inviteBanner: '',         // 如"由 XX 工厂邀请加入"
    inviteTenantFixed: false, // true 时锁定公司选择字段
    i18nTexts: {},
  },

  buildLanguageNameMap(language) {
    return {
      'zh-CN': i18n.t('language.names.zh-CN', language),
      'en-US': i18n.t('language.names.en-US', language),
      'vi-VN': i18n.t('language.names.vi-VN', language),
      'km-KH': i18n.t('language.names.km-KH', language),
    };
  },

  buildI18nTexts(language) {
    return {
      brand: i18n.t('login.brand', language),
      wechatChecking: i18n.t('login.wechatChecking', language),
      company: i18n.t('login.company', language),
      loading: i18n.t('common.loading', language),
      companySearchPlaceholder: i18n.t('login.companySearchPlaceholder', language),
      companyNotFound: i18n.t('login.companyNotFound', language),
      companySelectedPrefix: i18n.t('login.companySelectedPrefix', language),
      username: i18n.t('login.username', language),
      usernamePlaceholder: i18n.t('login.usernamePlaceholder', language),
      password: i18n.t('login.password', language),
      passwordPlaceholder: i18n.t('login.passwordPlaceholder', language),
      submit: i18n.t('login.submit', language),
      submitting: i18n.t('login.submitting', language),
      wechatQuickLogin: i18n.t('login.wechatQuickLogin', language),
      serverUrl: i18n.t('login.serverUrl', language),
      serverUrlPlaceholder: i18n.t('login.serverUrlPlaceholder', language),
      noAccount: i18n.t('login.noAccount', language),
      registerNow: i18n.t('login.registerNow', language),
      inviteWithTenant: i18n.t('login.inviteWithTenant', language),
      inviteNoTenant: i18n.t('login.inviteNoTenant', language),
    };
  },

  applyLanguage(language) {
    const languageNameMap = this.buildLanguageNameMap(language);
    this.setData({
      currentLanguage: language,
      languageNameMap,
      currentLanguageLabel: languageNameMap[language] || languageNameMap['zh-CN'] || '中文',
      languageSwitchText: i18n.t('language.current', language),
      i18nTexts: this.buildI18nTexts(language),
    });
  },

  onLoad(options) {
    const currentLanguage = i18n.getLanguage();
    this.applyLanguage(currentLanguage);

    // 解析微信扫码 scene 参数（getwxacodeunlimit 扫码时会将 scene 放入 options.scene）
    if (options && options.scene) {
      try {
        const scene = decodeURIComponent(options.scene);
        const match = scene.match(/inviteToken=([A-Fa-f0-9]+)/);
        if (match && match[1]) {
          this._loadInviteTenant(match[1]);
        }
      } catch (_) { /* 忽略解析失败 */ }
    }
  },

  /**
   * 通过邀请 token 加载租户信息并预填公司
   */
  async _loadInviteTenant(token) {
    if (!token) return;
    try {
      const resp = await api.wechat.inviteInfo(token);
      if (resp && resp.code === 200 && resp.data && resp.data.tenantId) {
        const { tenantId, tenantName } = resp.data;
        const name = tenantName || '';
        this.setData({
          selectedTenantId: tenantId,
          selectedTenantName: name,
          tenantSearchText: name,
          inviteBanner: name
            ? (this.data.i18nTexts.inviteWithTenant || '').replace('{tenantName}', name)
            : this.data.i18nTexts.inviteNoTenant,
          inviteTenantFixed: true,
        });
      }
    } catch (e) {
      console.warn('[Login] 解析邀请 token 失败', e);
    }
  },

  async onShow() {
    this.applyLanguage(i18n.getLanguage());

    const token = getToken();
    if (token) {
      safeNavigate({ url: '/pages/home/index' }, 'switchTab').catch(() => {});
      return;
    }

    const envVersion = resolveEnvVersion();
    const showDevFields = envVersion !== 'release';

    let apiBaseUrl = getBaseUrl();  // 已自动处理占位符→内网地址降级
    if (showDevFields) {
      try {
        const saved = wx.getStorageSync('api_base_url');
        apiBaseUrl = normalizeBaseUrl(saved) || getBaseUrl();
      } catch (e) {
        apiBaseUrl = getBaseUrl();
      }
    }
    setBaseUrl(apiBaseUrl);

    // 正式/体验版：先静默尝试 openid 一键登录（已绑定则无需选公司）
    const shouldAutoWechat = (envVersion === 'trial' || envVersion === 'release') && !autoWechatTried;

    // ✅ 延迟到初始渲染完成后再 setData，避免 FLOW_INITIAL_CREATION 冲突
    await new Promise(resolve => {
      if (typeof wx.nextTick === 'function') {
        wx.nextTick(resolve);
      } else {
        setTimeout(resolve, 50);
      }
    });

    // ✅ 合并 setData 调用，减少渲染次数
    this.setData({
      envVersion,
      showDevFields,
      apiBaseUrl,
      wechatChecking: shouldAutoWechat,
    });

    if (shouldAutoWechat) {
      autoWechatTried = true;
      const loggedIn = await tryAutoWechatLogin();
      this.setData({ wechatChecking: false });
      if (loggedIn) return; // 登录成功，页面已跳转，无需继续
      // openid 未绑定 → 加载租户列表展示表单
    }

    // 加载租户列表（正弸登录流程 / openid 未绑定首次绑定）
    this.loadTenants();
  },

  /**
   * 登录页右上角语言切换。
   */
  onLanguageSwitchTap() {
    const { languageNameMap } = this.data;
    const langList = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];
    const itemList = langList.map((lang) => languageNameMap[lang] || lang);

    wx.showActionSheet({
      itemList,
      alertText: this.data.languageSwitchText || '语言',
      success: ({ tapIndex }) => {
        const nextLang = langList[tapIndex] || 'zh-CN';
        const appliedLang = i18n.setLanguage(nextLang);
        this.applyLanguage(appliedLang);
      },
      fail: () => {
        // ignore cancel
      },
    });
  },

  /**
   * 加载可用租户列表
   */
  async loadTenants() {
    this.setData({ tenantsLoading: true });
    try {
      const resp = await api.tenant.publicList();
      if (resp && resp.code === 200 && Array.isArray(resp.data)) {
        cachedTenants = resp.data;
        let selectedTenantId = null;
        let selectedTenantName = '';
        let tenantSearchText = '';

        // 如果只有一个租户，自动选中
        if (resp.data.length === 1) {
          selectedTenantId = resp.data[0].id;
          selectedTenantName = resp.data[0].tenantName || '';
          tenantSearchText = selectedTenantName;
        } else {
          // 尝试恢复上次选择的租户
          try {
            const lastId = wx.getStorageSync('lastTenantId');
            if (lastId) {
              const found = resp.data.find(t => String(t.id) === String(lastId));
              if (found) {
                selectedTenantId = found.id;
                selectedTenantName = found.tenantName || '';
                tenantSearchText = selectedTenantName;
              }
            }
          } catch (_) { /* ignore */ }
        }

        this.setData({
          selectedTenantId,
          selectedTenantName,
          tenantSearchText,
          tenantsLoading: false,
          showTenantResults: false,
          filteredTenants: [],
        });
        // 注意：此处不再自动触发 onWechatLogin
        // tryAutoWechatLogin 已经在 onShow 中尝试过（openid 未绑定才会走到这里）
        // 用户需手动选择公司并输入账号密码完成首次绑定
      } else {
        this.setData({ tenantsLoading: false });
      }
    } catch (_e) {
      console.error('[Login] 加载租户列表失败:', _e);
      this.setData({ tenantsLoading: false });
    }
  },

  /**
   * 公司搜索输入
   */
  onTenantSearch(e) {
    const text = (e && e.detail && e.detail.value) || '';
    // 如果用户修改了文本，清除已选中状态
    if (this.data.selectedTenantName && text !== this.data.selectedTenantName) {
      this.setData({ selectedTenantId: null, selectedTenantName: '' });
    }
    const keyword = text.toLowerCase();
    const filtered = keyword
      ? cachedTenants.filter(t => (t.tenantName || '').toLowerCase().indexOf(keyword) !== -1)
      : [];
    this.setData({
      tenantSearchText: text,
      filteredTenants: filtered,
      showTenantResults: filtered.length > 0,
    });
  },

  /**
   * 搜索框获得焦点 - 仅当已有输入内容时才显示列表
   */
  onTenantSearchFocus() {
    const text = this.data.tenantSearchText || '';
    const keyword = text.toLowerCase();
    if (!keyword) {
      // 空输入时不展开列表，等用户输入后再搜索
      return;
    }
    const filtered = cachedTenants.filter(t => (t.tenantName || '').toLowerCase().indexOf(keyword) !== -1);
    this.setData({ filteredTenants: filtered, showTenantResults: filtered.length > 0 });
  },

  /**
   * 选择搜索结果中的公司
   */
  onTenantSelect(e) {
    const index = e.currentTarget.dataset.index;
    const tenant = this.data.filteredTenants[index];
    if (tenant) {
      this.setData({
        selectedTenantId: tenant.id,
        selectedTenantName: tenant.tenantName || '',
        tenantSearchText: tenant.tenantName || '',
        showTenantResults: false,
      });
      // 记住选择
      try {
        wx.setStorageSync('lastTenantId', String(tenant.id));
        wx.setStorageSync('lastTenantName', tenant.tenantName || '');
      } catch (_) { /* ignore */ }
    }
  },

  /**
   * 获取当前选中的租户ID
   * @returns {number|null}
   */
  getSelectedTenantId() {
    return this.data.selectedTenantId || null;
  },

  onUsernameInput(e) {
    this.setData({ username: (e && e.detail && e.detail.value) || '' });
  },

  onPasswordInput(e) {
    this.setData({ password: (e && e.detail && e.detail.value) || '' });
  },

  onApiBaseUrlInput(e) {
    this.setData({ apiBaseUrl: (e && e.detail && e.detail.value) || '' });
  },

  /**
   * 切换密码显示/隐藏
   */
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  /**
   * 清除已选公司
   */
  onClearTenant() {
    this.setData({
      selectedTenantId: null,
      selectedTenantName: '',
      tenantSearchText: '',
      showTenantResults: false,
      filteredTenants: [],
    });
  },

  /**
   * 统一登录（开发环境用账号密码，生产环境用微信）
   */
  async onLogin() {
    if (this.data.loading) return;

    const tenantId = this.getSelectedTenantId();
    if (!tenantId) {
      toast.error(i18n.t('login.selectCompanyFirst'));
      return;
    }

    const username = (this.data.username || '').trim();
    const password = (this.data.password || '').trim();

    // 验证账号密码
    let err = validateUsername(username);
    if (err) { toast.error(err); return; }
    err = validatePassword(password);
    if (err) { toast.error(err); return; }

    // 开发模式下设置 API 地址
    const apiBaseUrl = (this.data.apiBaseUrl || '').trim();
    if (this.data.showDevFields && apiBaseUrl) {
      err = validateAndSetBaseUrl(apiBaseUrl);
      if (err) { toast.error(err); return; }
    }

    this.setData({ loading: true });
    try {
      const code = await resolveLoginCode();
      if (!code) { toast.error(i18n.t('login.getCodeFailed')); return; }
      await executeLogin({ code, username, password, tenantId });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onWechatLogin() {
    if (this.data.loading) {
      return;
    }

    // 检查是否已选择公司
    const tenantId = this.getSelectedTenantId();
    if (!tenantId) {
      toast.error(i18n.t('login.selectCompanyFirst'));
      return;
    }

    // 验证并设置 API 地址
    const apiBaseUrl = (this.data.apiBaseUrl || '').trim();
    if (this.data.showDevFields && apiBaseUrl) {
      const err = validateAndSetBaseUrl(apiBaseUrl);
      if (err) {
        toast.error(err);
        return;
      }
    }

    this.setData({ loading: true });
    try {
      const code = await resolveLoginCode();
      if (!code) {
        toast.error(i18n.t('login.getCodeFailed'));
        return;
      }

      // 静默尝试：openid 已绑定则直接登录，未绑定则不弹错误提示，用户填写表单就可以
      await executeLogin({ code, tenantId }, { silent: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 手动注册 —— 直接跳转注册页
   */
  onManualRegister() {
    safeNavigate({ url: '/pages/register/index' }, 'navigateTo').catch(() => {});
  },
});
