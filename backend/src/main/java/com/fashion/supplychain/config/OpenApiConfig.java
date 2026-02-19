package com.fashion.supplychain.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("服装供应链管理系统 API")
                        .description("服装供应链管理系统的RESTful API文档，包含生产管理、财务管理、系统管理等模块")
                        .version("v1")
                        .contact(new Contact()
                                .name("技术支持")
                                .email("support@example.com")
                                .url("http://example.com"))
                        .license(new License()
                                .name("MIT License")
                                .url("https://opensource.org/licenses/MIT")));
    }
}
