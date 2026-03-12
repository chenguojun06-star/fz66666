package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import org.springframework.stereotype.Service;

/**
 * 知识库 Service — 供 KnowledgeSearchTool 进行 RAG 检索
 */
@Service
public class KnowledgeBaseService extends ServiceImpl<KnowledgeBaseMapper, KnowledgeBase> {
}
