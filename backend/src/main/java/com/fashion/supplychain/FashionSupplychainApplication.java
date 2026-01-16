package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.fashion.supplychain.*.mapper")
public class FashionSupplychainApplication {

    public static void main(String[] args) {
        SpringApplication.run(FashionSupplychainApplication.class, args);
    }

}
