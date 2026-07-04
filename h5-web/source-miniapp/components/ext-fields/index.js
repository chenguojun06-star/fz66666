/**
 * 扩展字段动态组件
 * 支持两种模式：form（表单录入）/ view（详情展示）
 * 根据 t_field_config 配置自动渲染自定义字段
 */
const { parseExtJson, collectExtValues, filterCustomFields, parseOptions, formatFieldValue } = require('../../../utils/api-modules/field-config-helpers');

Component({
  properties: {
    /** 模式：form=表单录入 / view=详情展示 */
    mode: {
      type: String,
      value: 'form',
    },
    /** 字段配置列表（完整列表，组件内部自动过滤） */
    fields: {
      type: Array,
      value: [],
    },
    /** 数据记录（含 extJson） */
    data: {
      type: Object,
      value: {},
    },
    /** 是否只显示自定义字段（isSystem=0），默认 true */
    customOnly: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    /** 渲染用的字段列表 */
    renderFields: [],
    /** 表单值（form 模式） */
    formValues: {},
    /** 选项展开 map */
    optionsMap: {},
  },

  observers: {
    'fields, data, mode, customOnly': function (fields, data, mode, customOnly) {
      this.refreshRender(fields, data, mode, customOnly);
    },
  },

  methods: {
    refreshRender(fields, data, mode, customOnly) {
      if (!fields || !fields.length) {
        this.setData({ renderFields: [], optionsMap: {} });
        return;
      }

      // 过滤字段
      let list = customOnly
        ? filterCustomFields(fields)
        : fields.filter(f => f.enabled !== 0).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      // 解析选项
      const optionsMap = {};
      list.forEach(f => {
        if (f.fieldType === 'select' || f.fieldType === 'multiselect') {
          optionsMap[f.fieldKey] = parseOptions(f.optionsJson);
        }
      });

      // 构建渲染数据
      const renderFields = list.map(f => {
        const value = this.getFieldValue(data, f.fieldKey);
        return {
          ...f,
          _value: value,
          _displayValue: formatFieldValue(value, f.fieldType, f.optionsJson),
        };
      });

      // 表单模式：初始化 formValues
      let formValues = {};
      if (mode === 'form') {
        list.forEach(f => {
          const val = this.getFieldValue(data, f.fieldKey);
          formValues[f.fieldKey] = val !== undefined ? val : '';
        });
      }

      this.setData({ renderFields, optionsMap, formValues });
    },

    getFieldValue(record, fieldKey) {
      if (!record) return undefined;
      if (record[fieldKey] !== undefined && record[fieldKey] !== null) {
        return record[fieldKey];
      }
      const ext = parseExtJson(record.extJson);
      return ext[fieldKey];
    },

    /** 表单输入 */
    onInput(e) {
      const { fieldKey } = e.currentTarget.dataset;
      const value = e.detail.value;
      this.setData({ [`formValues.${fieldKey}`]: value });
      this.triggerEvent('change', { fieldKey, value, allValues: this.data.formValues });
    },

    /** 选择器变更 */
    onPickerChange(e) {
      const { fieldKey } = e.currentTarget.dataset;
      const index = e.detail.value;
      const options = this.data.optionsMap[fieldKey] || [];
      const selected = options[index];
      if (selected) {
        this.setData({ [`formValues.${fieldKey}`]: selected.value });
        this.triggerEvent('change', { fieldKey, value: selected.value, allValues: this.data.formValues });
      }
    },

    /** 开关切换 */
    onSwitchChange(e) {
      const { fieldKey } = e.currentTarget.dataset;
      const value = e.detail.value ? 1 : 0;
      this.setData({ [`formValues.${fieldKey}`]: value });
      this.triggerEvent('change', { fieldKey, value, allValues: this.data.formValues });
    },

    /** 多选变更 */
    onMultiChange(e) {
      const { fieldKey } = e.currentTarget.dataset;
      const values = e.detail.value;
      this.setData({ [`formValues.${fieldKey}`]: values });
      this.triggerEvent('change', { fieldKey, value: values, allValues: this.data.formValues });
    },

    /** 日期变更 */
    onDateChange(e) {
      const { fieldKey } = e.currentTarget.dataset;
      const value = e.detail.value;
      this.setData({ [`formValues.${fieldKey}`]: value });
      this.triggerEvent('change', { fieldKey, value, allValues: this.data.formValues });
    },

    /** 获取收集后的 extJson 字符串（供父组件调用） */
    collectExtJson(existingExtJson) {
      return collectExtValues(this.data.formValues, this.data.renderFields, existingExtJson);
    },

    /** 获取表单值（供父组件调用） */
    getFormValues() {
      return this.data.formValues;
    },
  },
});
