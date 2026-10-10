package com.linksprite.common;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * API-Key 鉴权过滤器：公开子域名部署时的最小防护层。
 *
 * 规则：
 * - 未配置 key（为空）= 不校验，本地开发零成本
 * - 放行 GET /api/health 与 GET /api（根索引，容器/反代探活用）
 * - 其余请求必须携带 X-API-Key 请求头且与配置一致，否则 401
 *
 * key 通过环境变量 LINKSPRITE_API_KEY 注入（Spring 宽松绑定）。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApiKeyFilter implements Filter {

    @Value("${linksprite.api-key:}")
    private String apiKey;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        if (apiKey == null || apiKey.isBlank()) {
            chain.doFilter(request, response);
            return;
        }

        if ("GET".equalsIgnoreCase(req.getMethod())
                && ("/api/health".equals(req.getRequestURI()) || "/api".equals(req.getRequestURI()))) {
            chain.doFilter(request, response);
            return;
        }

        if (apiKey.equals(req.getHeader("X-API-Key"))) {
            chain.doFilter(request, response);
            return;
        }

        resp.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        resp.setContentType("application/json;charset=UTF-8");
        resp.getWriter().write("{\"code\":401,\"message\":\"API-Key 无效或缺失\"}");
    }
}
