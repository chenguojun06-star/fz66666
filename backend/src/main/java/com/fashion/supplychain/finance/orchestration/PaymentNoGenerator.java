package com.fashion.supplychain.finance.orchestration;

import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class PaymentNoGenerator {

    private static final AtomicLong SEQ = new AtomicLong(1);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    public String generate() {
        String datePart = LocalDateTime.now().format(DATE_FMT);
        long seq = SEQ.getAndIncrement();
        return String.format("WP%s%06d", datePart, seq);
    }
}
