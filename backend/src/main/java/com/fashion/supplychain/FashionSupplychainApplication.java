package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import com.fashion.supplychain.production.orchestration.ProductionCleanupOrchestrator;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.fashion.supplychain.**.mapper")
public class FashionSupplychainApplication {

    public static void main(final String[] args) {
        SpringApplication.run(FashionSupplychainApplication.class, args);
    }

    @Bean
    @Profile("!test")
    public ApplicationRunner cleanupOrphanData(final ProductionCleanupOrchestrator cleanupOrchestrator) {
        return args -> {
            cleanupOrchestrator.cleanupOrphanData();
        };
    }

    /** 修复历史脏数据：other_cost 被老 bug 错误写入了二次工艺总价 */
    @Bean
    @Profile("!test")
    public ApplicationRunner fixBuggyOtherCost(final StyleQuotationOrchestrator styleQuotationOrchestrator) {
        return args -> {
            styleQuotationOrchestrator.fixBuggyOtherCostOnStartup();
        };
    }

}
