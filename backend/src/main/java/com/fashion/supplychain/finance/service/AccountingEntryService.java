package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.AccountingEntry;

/**
 * 会计分录 Service（Orchestrator 层调用，无 @Transactional）
 */
public interface AccountingEntryService extends IService<AccountingEntry> {
}
