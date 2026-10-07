package com.linksprite.contract;

import org.fisco.bcos.sdk.v3.client.Client;
import org.fisco.bcos.sdk.v3.crypto.keypair.CryptoKeyPair;
import org.fisco.bcos.sdk.v3.transaction.model.dto.CallResponse;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 合规流转策略合约封装
 * 对应 Solidity: TransferPolicy.sol
 */
public class TransferPolicy extends BaseContract {

    private static final String ABI = """
            [
              {"type":"constructor","stateMutability":"nonpayable","inputs":[{"name":"_platform","type":"address"}]},
              {"type":"function","name":"canTransfer","stateMutability":"nonpayable","inputs":[{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"tokenId","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
              {"type":"function","name":"recordTransfer","stateMutability":"nonpayable","inputs":[{"name":"from","type":"address"}],"outputs":[]},
              {"type":"function","name":"getTransferStatus","stateMutability":"view","inputs":[{"name":"addr","type":"address"}],"outputs":[{"name":"lastTransfer","type":"uint256"},{"name":"cooldownRemaining","type":"uint256"},{"name":"monthlyCount","type":"uint256"},{"name":"monthlyLimit","type":"uint256"}]},
              {"type":"function","name":"platform","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"address"}]},
              {"type":"function","name":"TRANSFER_COOLDOWN","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint256"}]},
              {"type":"function","name":"MAX_TRANSFERS_PER_MONTH","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint256"}]},
              {"type":"function","name":"lastTransferTime","stateMutability":"view","inputs":[{"name":"","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
              {"type":"function","name":"monthlyTransferCount","stateMutability":"view","inputs":[{"name":"","type":"address"},{"name":"","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},
              {"type":"event","name":"TransferPolicyUpdated","anonymous":false,"inputs":[{"indexed":false,"name":"cooldown","type":"uint256"},{"indexed":false,"name":"maxPerMonth","type":"uint256"}]}
            ]
            """;

    public TransferPolicy(Client client, CryptoKeyPair cryptoKeyPair, String contractAddress) {
        super(client, cryptoKeyPair, contractAddress, ABI);
    }

    /**
     * 校验是否可以转赠
     */
    public boolean canTransfer(String from, String to, BigInteger tokenId) {
        CallResponse response = call("canTransfer", Arrays.asList(from, to, tokenId));
        return resultBool(response, 0);
    }

    /**
     * 记录转赠行为
     */
    public void recordTransfer(String from) {
        sendTransaction("recordTransfer", Collections.singletonList(from));
    }

    /**
     * 查询转赠状态（[上次转赠时间, 当月已转次数, ...]）
     */
    public List<String> getTransferStatus(String addr) {
        return resultStrings(call("getTransferStatus", Collections.singletonList(addr)));
    }
}
