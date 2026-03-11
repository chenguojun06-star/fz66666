with open("miniprogram/components/floating-bell/index.wxss", "r") as f:
    FloatingCss = f.read()

with open("miniprogram/components/ai-assistant/index.wxss", "r") as f:
    AssistantCss = f.read()

task_css = """
/* Tabs */
.header-tabs {
  display: flex;
  gap: 32rpx;
  align-items: center;
}
.tab-item {
  font-size: 30rpx;
  color: #666;
  padding-bottom: 8rpx;
  position: relative;
}
.tab-item.active {
  font-weight: bold;
  color: #1a1a1a;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40rpx;
  height: 6rpx;
  border-radius: 4rpx;
  background: var(--primary-color, #2D7FF9);
}
.tab-badge {
  position: absolute;
  top: -12rpx;
  right: -24rpx;
  background: #ff4d4f;
  color: #fff;
  font-size: 20rpx;
  padding: 0 8rpx;
  border-radius: 20rpx;
  line-height: 28rpx;
  min-width: 28rpx;
  text-align: center;
}

/* Chat Main Layout */
.chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 0;
}

/* Base button trigger badge */
.ai-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  background: #ff4d4f;
  color: #fff;
  font-size: 20rpx;
  line-height: 32rpx;
  padding: 0 10rpx;
  border-radius: 16rpx;
  font-weight: bold;
  box-shadow: 0 2rpx 4rpx rgba(255, 77, 79, 0.4);
}

/* Tasks scroll main container */
.tasks-main {
  flex: 1;
  height: 0;
  box-sizing: border-box;
  padding: 24rpx;
  background: #f8f9fa;
}

/* Task specific styles copied and adapted from floating-bell */
.task-section {
  margin-bottom: 24rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
  display: flex;
  align-items: center;
}
.section-title .icon {
  margin-right: 8rpx;
  font-size: 32rpx;
}
.task-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.05);
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1rpx solid #f5f5f5;
  padding-bottom: 12rpx;
}
.task-header .order-no {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}
.task-header .style-no {
  font-size: 24rpx;
  color: #666;
  background: #f5f5f5;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}
.task-header .status {
  font-size: 24rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}
.tag-orange {
  color: #fa8c16;
  background: #fff7e6;
  border: 1rpx solid #ffd591;
}
.task-content {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.task-desc {
  font-size: 26rpx;
  color: #333;
}
.task-meta {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #999;
}
.task-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12rpx;
  border-top: 1rpx dashed #f5f5f5;
}
.task-footer .time {
  font-size: 22rpx;
  color: #ccc;
}
.action-btn {
  margin: 0;
  font-size: 24rpx !important;
  color: #666;
  background: #f5f5f5;
  border-radius: 8rpx;
  padding: 8rpx 24rpx !important;
}
.action-btn::after {
  border: none;
}
.action-btn.primary {
  color: #fff;
  background: var(--primary-color, #2D7FF9);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 0;
}
.empty-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #999;
}
"""

with open("miniprogram/components/ai-assistant/index.wxss", "w") as f:
    f.write(AssistantCss + "\n" + task_css)
