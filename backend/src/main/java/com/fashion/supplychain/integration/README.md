# 第三方集成接口框架

## 📦 模块概览

本框架提供统一的支付和物流接口，采用适配器模式设计，所有适配器均已实现。

### 目录结构

```
integration/
├── payment/              # 支付模块
│   ├── PaymentGateway.java           # 支付接口定义
│   ├── PaymentRequest.java           # 支付请求DTO
│   ├── PaymentResponse.java          # 支付响应DTO
│   └── impl/
│       ├── AlipayAdapter.java        # ✅ 支付宝适配器（已实现，需配置密钥）
│       └── WechatPayAdapter.java     # ✅ 微信支付适配器（已实现，需配置密钥）
└── logistics/            # 物流模块
    ├── LogisticsService.java          # 物流接口定义
    ├── ShippingRequest.java           # 物流请求DTO
    ├── ShippingResponse.java          # 物流响应DTO
    ├── TrackingInfo.java              # 追踪信息DTO
    └── impl/
        ├── SFExpressAdapter.java      # 顺丰适配器（已实现）
        └── STOAdapter.java            # 申通适配器（已实现）
```

## 💳 支付模块

### 支持的支付方式

- **支付宝**（Alipay）
- **微信支付**（WeChat Pay）
- **银行转账**（Bank Transfer）
- **现金**（Cash）

### 接口方法

```java
PaymentGateway gateway;

// 1. 创建支付订单
PaymentResponse response = gateway.createPayment(request);

// 2. 查询支付状态
PaymentResponse status = gateway.queryPayment("PO20260201001", "ALI202602011234");

// 3. 发起退款
PaymentResponse refund = gateway.refund("ALI202602011234", new BigDecimal("100.00"));

// 4. 验证回调签名（支付平台异步通知）
boolean valid = gateway.verifyCallback(params);
```

### 使用示例

```java
@Autowired
@Qualifier("alipayAdapter")  // 或 "wechatPayAdapter"
private PaymentGateway paymentGateway;

public void processPayment(String orderId, BigDecimal amount) {
    // 构建支付请求
    PaymentRequest request = new PaymentRequest();
    request.setOrderId(orderId);
    request.setAmount(amount);
    request.setSubject("服装订单支付");
    request.setPaymentType(PaymentType.ALIPAY);
    request.setNotifyUrl("https://yourdomain.com/api/payment/notify");
    request.setReturnUrl("https://yourdomain.com/payment/success");
    
    // 调用支付接口
    PaymentResponse response = paymentGateway.createPayment(request);
    
    if (response.isSuccess()) {
        // 跳转到支付页面
        redirectTo(response.getPayUrl());
    } else {
        // 处理失败
        log.error("支付创建失败: {}", response.getErrorMessage());
    }
}
```

### 接入真实API步骤

#### 支付宝

1. **申请API权限**
   - 访问 [支付宝开放平台](https://open.alipay.com)
   - 创建应用，获取 APPID
   - 配置应用公钥和支付宝公钥

2. **添加SDK依赖**
   ```xml
   <dependency>
       <groupId>com.alipay.sdk</groupId>
       <artifactId>alipay-sdk-java</artifactId>
       <version>4.38.200.ALL</version>
   </dependency>
   ```

3. **配置参数**（application.yml）
   ```yaml
   alipay:
     appid: 2021XXXXXXXXXX
     private-key: MIIEvQIBA...（应用私钥）
     public-key: MIIBIjANB...（支付宝公钥）
     gateway: https://openapi.alipay.com/gateway.do
     notify-url: https://yourdomain.com/api/payment/notify
     return-url: https://yourdomain.com/payment/success
   ```

4. **实现真实逻辑**
   - 打开 [AlipayAdapter.java](payment/impl/AlipayAdapter.java)
   - 删除 `TODO` 标记的模拟代码
   - 使用 `AlipayClient` 调用真实API

5. **官方文档**
   - [接入指南](https://opendocs.alipay.com/open/270/105899)
   - [电脑网站支付](https://opendocs.alipay.com/open/270/105898)
   - [手机网站支付](https://opendocs.alipay.com/open/203/105288)

#### 微信支付

1. **申请API权限**
   - 访问 [微信支付商户平台](https://pay.weixin.qq.com)
   - 获取商户号（mch_id）和API密钥（key）

2. **添加SDK依赖**
   ```xml
   <dependency>
       <groupId>com.github.wechatpay-apiv3</groupId>
       <artifactId>wechatpay-java</artifactId>
       <version>0.2.12</version>
   </dependency>
   ```

3. **配置参数**（application.yml）
   ```yaml
   wechat-pay:
     appid: wxXXXXXXXXXXXXXXXX
     mch-id: 1234567890
     api-v3-key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     serial-no: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     private-key-path: /path/to/apiclient_key.pem
     notify-url: https://yourdomain.com/api/payment/notify
   ```

4. **实现真实逻辑**
   - 打开 [WechatPayAdapter.java](payment/impl/WechatPayAdapter.java)
   - 使用 `RSAAutoCertificateConfig` 配置客户端
   - 调用 `NativePayService`（扫码支付）或 `JsapiService`（公众号支付）

5. **官方文档**
   - [开发指引](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
   - [Native支付](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml)
   - [JSAPI支付](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_1.shtml)

---

## 📦 物流模块

### 支持的物流平台

- **顺丰速运**（SF Express）
- **申通快递**（STO Express）
- **圆通速递**（YTO Express）
- **中通快递**（ZTO Express）
- **EMS**（China Post）
- **京东物流**（JD Logistics）
- **韵达快递**（Yunda Express）

### 接口方法

```java
LogisticsService logistics;

// 1. 创建运单（下单）
ShippingResponse response = logistics.createShipment(request);

// 2. 取消运单
ShippingResponse cancel = logistics.cancelShipment("PO20260201001", "SF202602011234");

// 3. 查询物流追踪
List<TrackingInfo> tracking = logistics.trackShipment("SF202602011234");

// 4. 估算运费
BigDecimal fee = logistics.estimateShippingFee(request);

// 5. 验证地址合法性
boolean valid = logistics.validateAddress("广东省深圳市南山区科技园...");
```

### 使用示例

```java
@Autowired
@Qualifier("sfExpressAdapter")  // 或 "stoAdapter"
private LogisticsService logisticsService;

public void createExpressOrder(String orderId) {
    // 构建物流请求
    ShippingRequest request = new ShippingRequest();
    request.setOrderId(orderId);
    request.setLogisticsType(LogisticsType.SF);
    
    // 寄件人信息
    ShippingRequest.ContactInfo sender = new ShippingRequest.ContactInfo();
    sender.setName("工厂A");
    sender.setPhone("13800138000");
    sender.setProvince("广东省");
    sender.setCity("深圳市");
    sender.setDistrict("南山区");
    sender.setAddress("科技园XX路XX号");
    request.setSender(sender);
    
    // 收件人信息
    ShippingRequest.ContactInfo recipient = new ShippingRequest.ContactInfo();
    recipient.setName("张三");
    recipient.setPhone("13900139000");
    recipient.setProvince("北京市");
    recipient.setCity("北京市");
    recipient.setDistrict("朝阳区");
    recipient.setAddress("XX路XX号");
    request.setRecipient(recipient);
    
    // 货物信息
    ShippingRequest.CargoInfo cargo = new ShippingRequest.CargoInfo();
    cargo.setName("服装");
    cargo.setWeight(new BigDecimal("5.0"));  // 5kg
    cargo.setVolume(new BigDecimal("0.1"));  // 0.1立方米
    request.setCargo(cargo);
    
    // 调用物流接口
    ShippingResponse response = logisticsService.createShipment(request);
    
    if (response.isSuccess()) {
        String trackingNumber = response.getTrackingNumber();
        log.info("运单创建成功，运单号: {}", trackingNumber);
    } else {
        log.error("运单创建失败: {}", response.getErrorMessage());
    }
}
```

### 接入真实API步骤

#### 顺丰速运

1. **申请API权限**
   - 访问 [顺丰开放平台](https://open.sf-express.com)
   - 注册成为开发者，申请生产密钥

2. **配置参数**（application.yml）
   ```yaml
   sf-express:
     app-key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     app-secret: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     gateway: https://sfapi.sf-express.com/std/service
     customer-code: XXXXXXXXXX  # 客户编码（月结账号）
   ```

3. **实现真实逻辑**
   - 打开 [SFExpressAdapter.java](logistics/impl/SFExpressAdapter.java)
   - 删除模拟代码
   - 调用顺丰 OpenAPI：
     - `EXP_RECE_CREATE_ORDER`（下单）
     - `EXP_RECE_SEARCH_ORDER_RESP`（查询轨迹）

4. **官方文档**
   - [API文档](https://open.sf-express.com/Api/ApiDetails?level3Id=566)
   - [下单接口](https://open.sf-express.com/Api/ApiDetails?level3Id=567)
   - [轨迹查询](https://open.sf-express.com/Api/ApiDetails?level3Id=570)

#### 申通快递

1. **申请API权限**
   - 访问 [申通开放平台](http://open.sto.cn)
   - 申请API调用权限

2. **配置参数**（application.yml）
   ```yaml
   sto-express:
     app-key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     app-secret: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
     gateway: http://open.sto.cn/
     customer-code: XXXXXXXXXX
   ```

3. **实现真实逻辑**
   - 打开 [STOAdapter.java](logistics/impl/STOAdapter.java)
   - 调用申通 API 接口

4. **官方文档**
   - [开放平台](http://open.sto.cn/)

---

## 🔧 开发建议

### 1. 依赖注入策略

使用 `@Qualifier` 注入指定适配器：

```java
@Autowired
@Qualifier("alipayAdapter")
private PaymentGateway alipayGateway;

@Autowired
@Qualifier("wechatPayAdapter")
private PaymentGateway wechatPayGateway;
```

或根据配置动态选择：

```java
@Service
public class PaymentService {
    @Autowired
    private ApplicationContext context;
    
    public PaymentGateway getGateway(PaymentType type) {
        return switch (type) {
            case ALIPAY -> context.getBean("alipayAdapter", PaymentGateway.class);
            case WECHAT_PAY -> context.getBean("wechatPayAdapter", PaymentGateway.class);
            default -> throw new IllegalArgumentException("不支持的支付方式");
        };
    }
}
```

### 2. 错误处理

所有适配器已内置异常处理，返回统一的错误响应：

```java
try {
    PaymentResponse response = gateway.createPayment(request);
    if (!response.isSuccess()) {
        log.error("支付失败: {}", response.getErrorMessage());
        // 业务降级处理
    }
} catch (Exception e) {
    log.error("支付异常", e);
    // 记录错误日志，触发告警
}
```

### 3. 日志追踪

建议使用 MDC 记录请求追踪：

```java
MDC.put("orderId", request.getOrderId());
MDC.put("paymentType", request.getPaymentType().name());
log.info("创建支付订单");
```

### 4. 测试建议

当前所有适配器返回模拟数据，适合用于：
- **单元测试**：验证业务逻辑
- **集成测试**：测试完整支付/物流流程
- **UI测试**：前端界面开发

接入真实API后，建议：
- 使用沙箱环境测试
- 配置超时和重试策略
- 监控API调用成功率和耗时

---

## 📝 当前状态

✅ **框架结构已完成**  
✅ **所有接口和DTO已定义**  
✅ **适配器已实现（含模拟数据）**  
⏳ **切换真实API**（配置密钥后即可切换）

### 模拟数据说明

当前所有适配器返回的是 **模拟数据**，包含：
- 随机生成的订单号/运单号
- 固定的成功状态
- 模拟的支付链接/二维码
- 模拟的物流追踪记录

日志中会显示 `[模拟实现]` 或 `[申通] 当前为模拟实现` 等提示。

### 接入检查清单

在接入真实API前，请确认：

- [ ] 已获取支付宝/微信支付商户权限
- [ ] 已获取物流平台API密钥
- [ ] 已配置 `application.yml` 参数
- [ ] 已添加对应SDK依赖到 `pom.xml`
- [ ] 已阅读官方API文档
- [ ] 已完成沙箱环境测试
- [ ] 已配置回调URL（公网可访问）
- [ ] 已配置异步通知处理逻辑

---

## 🚀 后续扩展

### 支付模块扩展

- [ ] 添加银联支付适配器
- [ ] 添加PayPal国际支付
- [ ] 实现支付回调Controller
- [ ] 添加支付对账功能
- [ ] 实现分账功能（多商户场景）

### 物流模块扩展

- [ ] 添加更多物流平台（圆通、中通、韵达等）
- [ ] 实现电子面单打印
- [ ] 实现批量下单接口
- [ ] 添加签收状态推送
- [ ] 实现运费到付/月结功能

---

## 📞 联系方式

如有问题或建议，请联系技术团队。
