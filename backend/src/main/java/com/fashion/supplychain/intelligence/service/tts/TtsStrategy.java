package com.fashion.supplychain.intelligence.service.tts;

public interface TtsStrategy {

    byte[] synthesize(String text, String voiceName);

    String getDefaultVoice();

    String getProviderName();
}
