package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import com.fashion.supplychain.production.orchestration.ProductionCleanupOrchestrator;

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

}
