package com.fashion.supplychain.config;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.websocket.HandshakeResponse;
import jakarta.websocket.server.HandshakeRequest;
import jakarta.websocket.server.ServerEndpointConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * WebSocket握手拦截器 - 验证JWT token防止跨租户连接
 * 
 * 安全要求：
 * 1. 连接时必须携带有效的JWT token（通过URL query参数传递）
 * 2. token中的tenantId必须与URL路径中的tenantId匹配
 * 3. token过期或无效的连接将被拒绝
 * 
 * 前端调用方式：ws://host/ws/order-progress/{tenantId}?token={jwt}
 * 
 * 注意：使用ServerEndpointConfig.Configurator模式而非HandshakeInterceptor，
 * 因为ServerEndpointExporter不支持传统WebSocketConfigurer拦截器模式。
 */
@Component
@Slf4j
public class WebSocketHandshakeInterceptor extends ServerEndpointConfig.Configurator {

    private AuthTokenService authTokenService;

    // 通过Setter注入（因为Configurator由ServerEndpointExporter管理，不自动注入）
    public void setAuthTokenService(AuthTokenService authTokenService) {
        this.authTokenService = authTokenService;
    }

    @Override
    public void modifyHandshake(ServerEndpointConfig sec, HandshakeRequest request, HandshakeResponse response) {
        super.modifyHandshake(sec, request, response);
        
        // 1. 提取token参数（HandshakeRequest无法直接获取query参数，需要从requestURI解析）
        String query = request.getRequestURI().getQuery();
        String token = extractTokenFromQuery(query);
        
        if (!StringUtils.hasText(token)) {
            log.warn("[WS] 缺失token参数，拒绝连接: uri={}", request.getRequestURI());
            throw new SecurityException("缺失token参数");
        }

        // 2. 镜像token有效性
        try {
            TokenSubject tokenSubject = authTokenService.verifyAndParse(token);
            if (tokenSubject == null) {
                log.warn("[WS] token验证失败，token无效或过期");
                throw new SecurityException("token无效或过期");
            }

            // 3. 提取tenantId并验证与URL路径匹配
            Long tokenTenantId = tokenSubject.getTenantId();
            String pathTenantId = extractTenantIdFromPath(request.getRequestURI().getPath());
            
            if (pathTenantId == null) {
                log.warn("[WS] URL路径中缺失tenantId: path={}", request.getRequestURI().getPath());
                throw new SecurityException("URL路径缺失tenantId");
            }

            Long urlTenantId = Long.parseLong(pathTenantId);
            if (!urlTenantId.equals(tokenTenantId)) {
                log.warn("[WS] tenantId不匹配: urlTenantId={}, tokenTenantId={}, 拒绝跨租户连接", 
                         urlTenantId, tokenTenantId);
                throw new SecurityException("tenantId不匹配，拒绝跨租户连接");
            }

            // 4. 将认证信息存入WebSocket Session user properties，供后续使用
            Map<String, Object> userProperties = sec.getUserProperties();
            userProperties.put("userId", tokenSubject.getUserId());
            userProperties.put("username", tokenSubject.getUsername());
            userProperties.put("tenantId", tokenTenantId);
            userProperties.put("tokenValidated", true);

            log.info("[WS] 握手认证成功: tenantId={}, userId={}, username={}", 
                     tokenTenantId, tokenSubject.getUserId(), tokenSubject.getUsername());

        } catch (SecurityException e) {
            throw e; // 直接抛出SecurityException终止握手
        } catch (Exception e) {
            log.error("[WS] token解析异常，拒绝连接: {}", e.getMessage());
            throw new SecurityException("token解析异常");
        }
    }

    /**
     * 从query字符串中提取token参数
     * query格式: token=xxx&other=yyy
     */
    private String extractTokenFromQuery(String query) {
        if (query == null) return null;
        String[] params = query.split("&");
        for (String param : params) {
            String[] kv = param.split("=");
            if (kv.length == 2 && "token".equals(kv[0])) {
                return kv[1];
            }
        }
        return null;
    }

    /**
     * 从URL路径中提取tenantId
     * 路径格式: /ws/order-progress/{tenantId}
     */
    private String extractTenantIdFromPath(String path) {
        if (path == null) return null;
        String[] segments = path.split("/");
        // segments[0]="" [1]="ws" [2]="order-progress" [3]="{tenantId}"
        if (segments.length >= 4) {
            return segments[3];
        }
        return null;
    }
}