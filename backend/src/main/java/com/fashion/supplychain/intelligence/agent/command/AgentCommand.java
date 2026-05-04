package com.fashion.supplychain.intelligence.agent.command;

import java.util.Map;

public interface AgentCommand {

    String getCommandId();

    String getCommandName();

    String getDescription();

    CommandRiskLevel getRiskLevel();

    CommandPreCheckResult preCheck(Map<String, Object> arguments);

    CommandResult execute(Map<String, Object> arguments);

    CommandPostVerifyResult postVerify(Map<String, Object> arguments, CommandResult execResult);
}
