import re

with open('miniprogram/components/ai-assistant/index.js', 'r') as f:
    content = f.read()

old_block = """    // Delegation of Task clicks
    handleQualityApprove(e) { bellTaskActions.handleQualityApprove(e, this); },
    handleQualityReject(e) { bellTaskActions.handleQualityReject(e, this); },
    handleCuttingConfirm(e) { bellTaskActions.handleCuttingConfirm(e, this); },
    handleWarehouseInbound(e) { bellTaskActions.handleWarehouseInbound(e, this); },
    handlePurchaseTask(e) { bellTaskActions.handleProcurementTask(e, this); },"""

new_block = """    // Delegation of Task clicks
    handleQualityTask(e) {
      const task = e.currentTarget.dataset.item;
      this.setData({ isOpen: false });
      bellTaskActions.handleQualityTask(task);
    },
    handleCuttingTask(e) {
      const task = e.currentTarget.dataset.item;
      this.setData({ isOpen: false });
      bellTaskActions.handleCuttingTask(task);
    },
    handleWarehouseTask(e) {
      const task =import re

with open('miniprogra  
with opset    content = f.read()

old_block = """    // Delegation of Task clwa
old_block = """    /ll
    handleQualityApprove(e) { bellTaskActions.sk    handleQualhandlePurchaseTask(e) {
      const task = e.currentTarget.dataset    handleCuttingConfirm(e) { bellTaskActions.handleCuttingConfirm(ehandleProc    handleWarehouseInbound(e) { bellTaskActions.handleWarehouseInbound(e, thisep    handlePurchaseTask(e) { bellTaskActions.handleProcurementTask(e, this); },"""
x.
new_block = """    // Delegation of Task clicks
    handleQualityTask(e) {
    y!"    handleQualityTask(e) {
      const task =  r     e")
