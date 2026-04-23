package com.fashion.supplychain.integration.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.entity.LogisticsTrack;
import com.fashion.supplychain.integration.mapper.LogisticsTrackMapper;
import com.fashion.supplychain.integration.service.LogisticsTrackService;
import org.springframework.stereotype.Service;

@Service
public class LogisticsTrackServiceImpl extends ServiceImpl<LogisticsTrackMapper, LogisticsTrack> implements LogisticsTrackService {
}
