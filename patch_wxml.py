with open("miniprogram/components/ai-assistant/index.wxml", "r") as f:
    text = f.read()

# Replace trigger
text = text.replace(
    '  <!-- 顶部固定入口，位于铃铛左侧，使用CSS背景作为图标展示 -->\n  <view class="ai-trigger-btn" catchtap="toggleChat" hover-class="ai-trigger-hover" hover-stay-time="50" wx:if="{{!isOpen}}">\n  </view>',
    '  <!-- 顶部固定入口，位于铃铛左侧，使用CSS背景作为图标展示 -->\n  <view class="ai-trigger-btn" catchtap="toggleChat" hover-class="ai-trigger-hover" hover-stay-time="50" wx:if="{{!isOpen}}">\n    <view class="ai-badge" wx:if="{{totalTasks > 0}}">{{totalTasks}}</view>\n  </view>'
)

# Replace header
text = text.replace(
    '''    <view class="chat-header">
      <view class="chat-header-left">
        <view class="chat-avatar">☁️</view>
        <view class="chat-header-text">
          <text class="chat-title">小云 智能助理</text>
          <text class="chat-subtitle">云裳智链 · 实时数据支持</text>
        </view>
      </view>
      <view class="chat-header-actions">
        <view class="header-action-btn" catchtap="clearMessages" title="清空对话">🗑</view>
        <view class="header-action-btn close-btn" catchtap="toggleChat">×</view>
      </view>
    </view>''',
    '''    <view class="chat-header">
      <view class="header-tabs">
        <view class="tab-item {{currentTab === 'chat' ? 'active' : ''}}" catchtap="switchTab" data-tab="chat">
          <text>☁️ 小云助理</text>
        </view>
        <view class="tab-item {{currentTab === 'tasks' ? 'active' : ''}}" catchtap="switchTab" data-tab="tasks">
          <text>📋 待办任务</text>
          <view class="tab-badge" wx:if="{{totalTasks > 0}}">{{totalTasks > 99 ? '99+' : totalTasks}}</view>
        </view>
      </view>
      <view class="chat-header-actions">
        <view class="header-action-btn" catchtap="clearMessages" title="清空对话" wx:if="{{currentTab === 'chat'}}">🗑</view>
        <view class="header-action-btn close-btn" catchtap="toggleChat">×</view>
      </view>
    </view>
    
    <view class="chat-main" wx:if="{{currentTab === 'chat'}}">'''
)

# Wrap end
text = text.replace(
    '''    <view class="chat-input-area">
      <input class="chat-input" value="{{inputValue}}" placeholder="问点什么..." bindinput="onInput" confirm-type="send" bindconfirm
="sendMessage" />                                                                                                                         <button class="send-btn" catchtap="sendMessage" disabled="{{isLoading || !inputValue}}">发送</button>
    </view>
  </view>
</view>''',
    '''    <view class="chat-input-area">
      <input class="chat-input" value="{{inputValue}}" placeholder="问点什么..." bindinput="onInput" confirm-type="send" bindconfirm="sendMessage" />
      <button class="send-btn" catchtap="sendMessage" disabled="{{isLoading || !inputValue}}">发送</button>
    </view>
    </view> <!-- Close chat-main -->

    <!-- Tasks Main View -->
    <scroll-view class="tasks-main" scroll-y wx:if="{{currentTab === 'tasks'}}">
      <view class="empty-state" wx:if="{{totalTasks === 0}}">
        <view class="empty-icon">🎉</view>
        <view class="empty-text">太棒了！所有任务都处理完了</view>
      </view>

      <!-- 质检任务 -->
      <view class="task-section" wx:if="{{qualityTasks && qualityTasks.length > 0}}">
        <view class="section-title">
          <text class="icon">🔍</text> 待质检 ({{qualityTasks.length}})
        </view>
        <view class="task-card" wx:for="{{qualityTasks}}" wx:key="orderId" bindtap="handleQualityTask" data-item="{{item}}">
          <view class="task-header">
            <text class="order-no">{{item.orderNo}}</text>
            <text class="style-no">{{item.styleNo}}</text>
          </view>
          <view class="task-content">
            <text class="task-desc">款式: {{item.styleName || '未知'}}</text>
            <view class="task-meta">
              <text class="qty">数量: {{item.orderQuantity}}</text>
              <text class="customer">{{item.customerName || ''}}</text>
            </view>
          </view>
          <view class="task-footer">
            <text class="time">创建于: {{item.createdAt}}</text>
            <button class="action-btn primary" size="mini" catchtap="handleQualityTask" data-item="{{item}}">去质检</button>
          </view>
        </view>
      </view>

      <!-- 入库任务 -->
      <view class="task-section" wx:if="{{warehouseTasks && warehouseTasks.length > 0}}">
        <view class="section-title">
          <text class="icon">📦</text> 待入库 ({{warehouseTasks.length}})
        </view>
        <view class="task-card" wx:for="{{warehouseTasks}}" wx:key="orderId" bindtap="handleWarehouseTask" data-item="{{item}}">
          <view class="task-header">
            <text class="order-no">{{item.orderNo}}</text>
            <text class="style-no">{{item.styleNo}}</text>
          </view>
          <view class="task-content">
            <text class="task-desc">需要入库成品</text>
            <view class="task-meta">
              <text class="qty">数量: {{item.orderQuantity}}</text>
            </view>
          </view>
          <view class="task-footer">
            <button class="action-btn primary" size="mini" catchtap="handleWarehouseTask" data-item="{{item}}">去入库</button>
          </view>
        </view>
      </view>

      <!-- 裁剪任务 -->
      <view class="task-section" wx:if="{{cuttingTasks && cuttingTasks.length > 0}}">
        <view class="section-title">
          <text class="icon">✂️</text> 待裁剪 ({{cuttingTasks.length}})
        </view>
        <view class="task-card" wx:for="{{cuttingTasks}}" wx:key="orderId" bindtap="handleCuttingTask" data-item="{{item}}">
          <view class="task-header">
            <text class="order-no">{{item.orderNo}}</text>
            <text class="style-no">{{item.styleNo}}</text>
          </view>
          <view class="task-content">
            <text class="task-desc">等待裁剪</text>
            <view class="task-meta">
              <text class="qty">排单数量: {{item.orderQuantity || 0}}</text>
            </view>
          </view>
          <view class="task-footer">
            <button class="action-btn primary" size="mini" catchtap="handleCuttingTask" data-item="{{item}}">去裁剪</button>
          </view>
        </view>
      </view>

      <!-- 采购任务 -->
      <view class="task-section" wx:if="{{purchaseTasks && purchaseTasks.length > 0}}">
        <view class="section-title">
          <text class="icon">🛒</text> 待采购 ({{purchaseTasks.length}})
        </view>
        <view class="task-card" wx:for="{{purchaseTasks}}" wx:key="id" bindtap="handlePurchaseTask" data-item="{{item}}">
          <view class="task-header">
            <text class="order-no">{{item.purchaseNo}}</text>
            <text class="status tag-orange">待处理</text>
          </view>
          <view class="task-content">
            <text class="task-desc">申请人: {{item.applicantName || '未知'}}</text>
            <view class="task-meta">
              <text class="qty">总金额: ¥{{item.totalAmount || '0.00'}}</text>
            </view>
          </view>
          <view class="task-footer">
            <text class="time">{{item.createdAt}}</text>
            <button class="action-btn" size="mini" catchtap="handlePurchaseTask" data-item="{{item}}">查看</button>
          </view>
        </view>
      </view>

    </scroll-view>
  </view>
</view>'''
)

# And fix line formatting
text = text.replace('bindconfirm\n="sendMessage" />                                                                                                                         <button', 'bindconfirm="sendMessage" />\n      <button')

with open("miniprogram/components/ai-assistant/index.wxml", "w") as f:
    f.write(text)
