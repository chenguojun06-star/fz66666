package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
// import com.fashion.supplychain.production.orchestration.ProductionCleanupOrchestrator;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.fashion.supplychain.**.mapper")
public class FashionSupplychainApplication {

    private static final Logger log = LoggerFactory.getLogger(FashionSupplychainApplication.class);

    public static void main(final String[] args) {
        SpringApplication.run(FashionSupplychainApplication.class, args);
    }

    // ⚠️ ProductionCleanupOrchestrator 临时禁用 - 编译错误待修复
    // @Bean
    // @Profile("!test")
    // public ApplicationRunner cleanupOrphanData(final ProductionCleanupOrchestrator cleanupOrchestrator) {
    //     return args -> {
    //         try {
    //             cleanupOrchestrator.cleanupOrphanData();
    //         } catch (Exception e) {
    //             log.error("[Startup] cleanupOrphanData 失败（可能是数据库 schema 未同步），跳过清理，应用继续启动。原因: {}", e.getMessage());
    //         }
    //     };
    // }

    /** 修复历史脏数据：other_cost 被老 bug 错误写入了二次工艺总价 */
    @Bean
    @Profile("!test")
    public ApplicationRunner fixBuggyOtherCost(final StyleQuotationOrchestrator styleQuotationOrchestrator) {
        return args -> {
            try {
                styleQuotationOrchestrator.fixBuggyOtherCostOnStartup();
            } catch (Exception e) {
                log.error("[Startup] fixBuggyOtherCost 失败，跳过修复，应用继续启动。原因: {}", e.getMessage());
            }
        };
    }

}
