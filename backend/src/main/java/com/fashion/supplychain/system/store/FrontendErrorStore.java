package com.fashion.supplychain.system.store;

import com.fashion.supplychain.system.dto.FrontendErrorDTO;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

@Component
public class FrontendErrorStore {

    private static final int MAX_SIZE = 200;
    private final ConcurrentLinkedDeque<FrontendErrorDTO> buffer = new ConcurrentLinkedDeque<>();

    public void add(FrontendErrorDTO error) {
        buffer.addLast(error);
        while (buffer.size() > MAX_SIZE) {
            buffer.pollFirst();
        }
    }

    public List<FrontendErrorDTO> getRecent(int limit) {
        List<FrontendErrorDTO> all = new ArrayList<>(buffer);
        int start = Math.max(0, all.size() - limit);
        return new ArrayList<>(all.subList(start, all.size()));
    }

    public int size() {
        return buffer.size();
    }

    public long countSince(LocalDateTime since) {
        DateTimeFormatter fmt = DateTimeFormatter.ISO_DATE_TIME;
        return buffer.stream().filter(e -> {
            if (e.getOccurredAt() == null) return false;
            try {
                String raw = e.getOccurredAt().replace("Z", "");
                LocalDateTime t = LocalDateTime.parse(raw, fmt);
                return !t.isBefore(since);
            } catch (Exception ex) {
                return false;
            }
        }).count();
    }
}
