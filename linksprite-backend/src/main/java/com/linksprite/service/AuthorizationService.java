package com.linksprite.service;

import com.linksprite.contract.AuthorizationRegistry;
import com.linksprite.dto.response.ChainTxResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigInteger;

/**
 * B端IP授权管理服务
 */
@Slf4j
@Service
public class AuthorizationService extends BaseService {

    @Autowired
    private ChainStatusService chainStatus;

    /** 链未启用时该 Bean 不存在，可选注入 */
    @Autowired(required = false)
    private AuthorizationRegistry authorizationRegistry;

    /**
     * 登记B端IP授权
     */
    public ChainTxResult register(
            String ipOwner, String contractNo, String workHash,
            BigInteger startTime, BigInteger endTime,
            Integer scope, BigInteger maxMint) {
        requireChain(chainStatus);
        log.info("登记IP授权: contractNo={}, ipOwner={}, maxMint={}", contractNo, ipOwner, maxMint);
        return checkTxResult(authorizationRegistry.registerAuthorization(
                ipOwner, contractNo, workHash, startTime, endTime,
                BigInteger.valueOf(scope), maxMint));
    }

    /**
     * 撤销授权
     */
    public ChainTxResult revoke(BigInteger authId) {
        requireChain(chainStatus);
        log.info("撤销授权: authId={}", authId);
        return checkTxResult(authorizationRegistry.revokeAuthorization(authId));
    }

    /**
     * 校验授权是否有效
     */
    public boolean isValid(BigInteger authId) {
        requireChain(chainStatus);
        return authorizationRegistry.isValid(authId);
    }

    /**
     * 查询授权详情
     */
    public String[] getAuthorization(BigInteger authId) {
        requireChain(chainStatus);
        return authorizationRegistry.getAuthorization(authId).toArray(new String[0]);
    }

    /**
     * 增加已铸造计数（NFT铸造成功后内部调用）
     */
    public void incrementMintedCount(BigInteger authId) {
        requireChain(chainStatus);
        authorizationRegistry.incrementMintedCount(authId);
    }
}
