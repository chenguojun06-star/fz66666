package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Autowired;
import com.fashion.supplychain.production.orchestration.ProductionCleanupOrchestrator;

@SpringBootApplication
@MapperScan("com.fashion.supplychain.*.mapper")
public class FashionSupplychainApplication {

    public static void main(String[] args) {
        SpringApplication.run(FashionSupplychainApplication.class, args);
    }

    @Bean
    public ApplicationRunner cleanupOrphanData(ProductionCleanupOrchestrator cleanupOrchestrator) {
        return args -> {
            cleanupOrchestrator.cleanupOrphanData();
        };
    }

}
