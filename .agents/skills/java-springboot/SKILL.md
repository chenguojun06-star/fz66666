---
name: java-springboot
description: 'Get best practices for developing applications with Spring Boot.'
---

> ⚠️ **本项目（服装供应链系统）覆盖说明 — 使用本 skill 前必读**
>
> 本 skill 来自第三方（`github/awesome-copilot`），是通用 Spring Boot 最佳实践。
> **其中有一条与本项目的既定架构直接冲突，以下条目以本项目为准，不要照此 skill 改架构：**
>
> - **「Project Setup & Structure → Package Structure」**
>   原文建议：*"Organize code by feature/domain … rather than by layer"*（按功能分包，而非按层分包）。
>   **本项目恰恰是「按层分包」**：`controller / orchestration / service / mapper`（+ `entity`）。
>   这是既定架构，**禁止改成按功能分包**。
>   - 依据：`CLAUDE.md`「按"层"分包是本项目的既定架构，不要改」
>   - 细则：`.agents/skills/fashion-architecture-rules`（分层 P0 铁律 + 各层职责/禁止项）
>   - 强制：pre-push 的 **ArchUnit 架构守护**每轮校验分层依赖，
>     改成非分层结构会**直接卡住推送**
>
> 其余条目（构造器注入、DTO 与校验、全局异常处理、事务粒度、SLF4J、测试切片等）
> 与本项目实践一致，可正常参考。

# Spring Boot Best Practices

Your goal is to help me write high-quality Spring Boot applications by following established best practices.

## Project Setup & Structure

- **Build Tool:** Use Maven (`pom.xml`) or Gradle (`build.gradle`) for dependency management.
- **Starters:** Use Spring Boot starters (e.g., `spring-boot-starter-web`, `spring-boot-starter-data-jpa`) to simplify dependency management.
- **Package Structure:** Organize code by feature/domain (e.g., `com.example.app.order`, `com.example.app.user`) rather than by layer (e.g., `com.example.app.controller`, `com.example.app.service`).
  - ⚠️ **本项目例外（重要）**：本项目按 **层** 分包（`controller / orchestration / service / mapper`），
    这是既定架构，**不要照本条目修改**。详见文件顶部的覆盖说明。

## Dependency Injection & Components

- **Constructor Injection:** Always use constructor-based injection for required dependencies. This makes components easier to test and dependencies explicit.
- **Immutability:** Declare dependency fields as `private final`.
- **Component Stereotypes:** Use `@Component`, `@Service`, `@Repository`, and `@Controller`/`@RestController` annotations appropriately to define beans.

## Configuration

- **Externalized Configuration:** Use `application.yml` (or `application.properties`) for configuration. YAML is often preferred for its readability and hierarchical structure.
- **Type-Safe Properties:** Use `@ConfigurationProperties` to bind configuration to strongly-typed Java objects.
- **Profiles:** Use Spring Profiles (`application-dev.yml`, `application-prod.yml`) to manage environment-specific configurations.
- **Secrets Management:** Do not hardcode secrets. Use environment variables, or a dedicated secret management tool like HashiCorp Vault or AWS Secrets Manager.

## Web Layer (Controllers)

- **RESTful APIs:** Design clear and consistent RESTful endpoints.
- **DTOs (Data Transfer Objects):** Use DTOs to expose and consume data in the API layer. Do not expose JPA entities directly to the client.
- **Validation:** Use Java Bean Validation (JSR 380) with annotations (`@Valid`, `@NotNull`, `@Size`) on DTOs to validate request payloads.
- **Error Handling:** Implement a global exception handler using `@ControllerAdvice` and `@ExceptionHandler` to provide consistent error responses.

## Service Layer

- **Business Logic:** Encapsulate all business logic within `@Service` classes.
- **Statelessness:** Services should be stateless.
- **Transaction Management:** Use `@Transactional` on service methods to manage database transactions declaratively. Apply it at the most granular level necessary.

## Data Layer (Repositories)

- **Spring Data JPA:** Use Spring Data JPA repositories by extending `JpaRepository` or `CrudRepository` for standard database operations.
- **Custom Queries:** For complex queries, use `@Query` or the JPA Criteria API.
- **Projections:** Use DTO projections to fetch only the necessary data from the database.

## Logging

- **SLF4J:** Use the SLF4J API for logging.
- **Logger Declaration:** `private static final Logger logger = LoggerFactory.getLogger(MyClass.class);`
- **Parameterized Logging:** Use parameterized messages (`logger.info("Processing user {}...", userId);`) instead of string concatenation to improve performance.

## Testing

- **Unit Tests:** Write unit tests for services and components using JUnit 5 and a mocking framework like Mockito.
- **Integration Tests:** Use `@SpringBootTest` for integration tests that load the Spring application context.
- **Test Slices:** Use test slice annotations like `@WebMvcTest` (for controllers) or `@DataJpaTest` (for repositories) to test specific parts of the application in isolation.
- **Testcontainers:** Consider using Testcontainers for reliable integration tests with real databases, message brokers, etc.

## Security

- **Spring Security:** Use Spring Security for authentication and authorization.
- **Password Encoding:** Always encode passwords using a strong hashing algorithm like BCrypt.
- **Input Sanitization:** Prevent SQL injection by using Spring Data JPA or parameterized queries. Prevent Cross-Site Scripting (XSS) by properly encoding output.
