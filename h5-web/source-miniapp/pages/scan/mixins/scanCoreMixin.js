/**
 * 扫码页面核心业务 Mixin - 聚合入口
 * 拆分为 scanValidator / scanSubmitter / scanStateManager 三个独立模块
 * @version 2.4
 * @date 2026-04-28
 * @module scanCoreMixin
 */
'use strict';

var scanValidator = require('./scanValidator');
var scanSubmitter = require('./scanSubmitter');
var scanStateManager = require('./scanStateManager');

var scanCoreMixin = Behavior({
  methods: Object.assign(
    {},
    scanValidator.methods,
    scanSubmitter.methods,
    scanStateManager.methods
  ),
});

module.exports = scanCoreMixin;
