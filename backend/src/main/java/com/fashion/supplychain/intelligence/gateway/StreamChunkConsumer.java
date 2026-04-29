package com.fashion.supplychain.intelligence.gateway;

@FunctionalInterface
public interface StreamChunkConsumer {
    void accept(String chunk, boolean isDone);
}
